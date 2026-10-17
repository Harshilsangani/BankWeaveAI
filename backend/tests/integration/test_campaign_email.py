"""Reviewed email delivery on copied state; SMTP is replaced in every API check."""

import os
import smtplib
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend.app import app
from backend.core import database
from backend.integrations.email import MailError, message, send_mail, settings


class CampaignEmailTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="campaign-email-")
        cls.original = database.DB_PATH
        target = Path(cls.temp.name) / "application.sqlite3"
        with (
            closing(
                sqlite3.connect(cls.original.resolve().as_uri() + "?mode=ro", uri=True)
            ) as source,
            closing(sqlite3.connect(target)) as dest,
        ):
            source.backup(dest)
        database.DB_PATH = target
        database.initialize()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        database.DB_PATH = cls.original
        cls.temp.cleanup()

    def setUp(self):
        self.environment = patch.dict(
            os.environ,
            {
                "BANKWEAVE_EMAIL_ENABLED": "true",
                "BANKWEAVE_EMAIL_TEST_RECIPIENT": "recipient@example.test",
                "BANKWEAVE_EMAIL_TEST_DAILY_LIMIT": "20",
                "SMTP_HOST": "smtp.example.test",
                "SMTP_PORT": "587",
                "SMTP_STARTTLS": "true",
                "SMTP_USERNAME": "sender@example.test",
                "SMTP_FROM": "sender@example.test",
                "SMTP_PASSWORD": "fake-secret",
                "BANKWEAVE_EMAIL_TEST_NAME": "Harshil",
                "BANKWEAVE_EMAIL_SIGNATURE": "Harshil Sangani",
            },
        )
        self.environment.start()
        self.smtp = patch("backend.features.campaigns.delivery.send_mail")
        self.send = self.smtp.start()
        self.headers = {"x-risklens-role": "admin"}
        with database.connect() as db:
            db.execute("DELETE FROM campaign_email_deliveries")
            db.execute("DELETE FROM campaign_review_events")
            db.execute(
                "UPDATE campaign_reports SET review_status='pending_review',review_revision=1"
            )
            row = db.execute(
                "SELECT r.id,d.customer_id FROM campaign_reports r JOIN campaign_drafts d ON d.run_id=r.run_id JOIN campaign_candidates c ON c.run_id=d.run_id AND c.customer_id=d.customer_id WHERE d.status='validated' AND c.contact_status='allowed' LIMIT 1"
            ).fetchone()
        self.assertIsNotNone(
            row, "Use a copied working fixture with completed campaigns."
        )
        self.report_id, self.customer_id = row
        report = self.client.get(
            "/campaign-reports/" + self.report_id, headers=self.headers
        ).json()
        self.body = dict(
            customerId=self.customer_id,
            revision=report["reviewRevision"],
            contentHash=report["contentHash"],
        )

    def tearDown(self):
        self.smtp.stop()
        self.environment.stop()

    def review(self):
        response = self.client.post(
            f"/campaign-reports/{self.report_id}/review",
            headers=self.headers,
            json=dict(
                revision=self.body["revision"],
                contentHash=self.body["contentHash"],
                decision="reviewed",
                note="Reviewed one sample for the isolated test inbox only.",
            ),
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.body["revision"] = response.json()["reviewRevision"]

    def submit(self, body=None, role="admin"):
        return self.client.post(
            f"/campaign-reports/{self.report_id}/test-email",
            headers={"x-risklens-role": role},
            json=body or self.body,
        )

    def test_requires_admin_review_and_exact_revision(self):
        self.assertEqual(self.submit().status_code, 409)
        for role in ("viewer", "analyst"):
            self.assertEqual(self.submit(role=role).status_code, 403)
        self.review()
        self.assertEqual(self.submit({**self.body, "revision": 1}).status_code, 409)
        self.assertEqual(
            self.submit({**self.body, "contentHash": "a" * 64}).status_code, 409
        )
        self.send.assert_not_called()

    def test_sends_formatted_saved_terms_to_configured_inbox_once(self):
        self.review()
        first = self.submit()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["status"], "accepted")
        self.assertEqual(first.json()["recipient"], "recipient@example.test")
        self.assertEqual(first.json(), self.submit().json())
        self.send.assert_called_once()
        config, email = self.send.call_args.args
        self.assertEqual(email["To"], config.recipient)
        self.assertIn("[BankWeave TEST]", email["Subject"])
        self.assertIn(
            "synthetic", email.get_body(preferencelist=("plain",)).get_content()
        )
        receipt = self.client.get(
            f"/campaign-reports/{self.report_id}/email-deliveries", headers=self.headers
        ).json()
        self.assertEqual(receipt["history"][0]["messageId"], first.json()["messageId"])
        self.assertNotIn("password", str(receipt).lower())

    def test_recipient_and_message_cannot_be_overridden(self):
        self.review()
        for field in ("recipient", "subject", "body", "sender"):
            self.assertEqual(
                self.submit({**self.body, field: "forged@example.test"}).status_code,
                422,
            )
        self.assertEqual(
            self.submit({**self.body, "customerId": "missing"}).status_code, 409
        )
        self.send.assert_not_called()

    def test_other_staff_cannot_read_or_send_assigned_report(self):
        from backend.core.security import Identity

        with patch(
            "backend.core.security.identity_adapter.resolve",
            return_value=Identity("unassigned-admin", "admin", "other-tenant"),
        ):
            self.assertEqual(self.submit().status_code, 403)
            self.assertEqual(
                self.client.get(
                    f"/campaign-reports/{self.report_id}/email-deliveries",
                    headers=self.headers,
                ).status_code,
                403,
            )
        self.send.assert_not_called()

    def test_current_consent_blocks_delivery(self):
        self.review()
        with patch(
            "backend.features.campaigns.delivery.contact_permission",
            return_value=("suppressed", "withdrawn", {}),
        ):
            self.assertEqual(self.submit().status_code, 409)
        self.send.assert_not_called()

    def test_definite_failure_requires_explicit_bounded_retry(self):
        self.review()
        self.send.side_effect = MailError("Authentication failed")
        self.assertEqual(self.submit().json()["status"], "failed")
        self.submit()
        self.assertEqual(self.send.call_count, 1)
        for _ in range(2):
            self.assertEqual(
                self.submit({**self.body, "retry": True}).json()["status"], "failed"
            )
        self.assertEqual(self.submit({**self.body, "retry": True}).status_code, 409)
        self.assertEqual(self.send.call_count, 3)

    def test_uncertain_result_never_resends(self):
        self.review()
        self.send.side_effect = MailError(
            "SMTP confirmation interrupted", uncertain=True
        )
        self.assertEqual(self.submit().json()["status"], "unknown")
        self.assertEqual(
            self.submit({**self.body, "retry": True}).json()["status"], "unknown"
        )
        self.send.assert_called_once()

    def test_concurrent_clicks_share_durable_submission(self):
        self.review()
        started, release = threading.Event(), threading.Event()

        def blocked(*args):
            started.set()
            self.assertTrue(release.wait(10))

        self.send.side_effect = blocked
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(self.submit)
            self.assertTrue(started.wait(10))
            try:
                other = self.submit()
                self.assertEqual(other.json()["status"], "sending", other.text)
            finally:
                release.set()
            self.assertEqual(first.result().json()["status"], "accepted")
        self.send.assert_called_once()

    def test_disabled_configuration_and_budget_block_delivery(self):
        self.review()
        with patch.dict(os.environ, {"BANKWEAVE_EMAIL_ENABLED": "false"}):
            self.assertEqual(self.submit().status_code, 400)
        with patch.dict(os.environ, {"BANKWEAVE_EMAIL_TEST_DAILY_LIMIT": "1"}):
            self.assertEqual(self.submit().json()["status"], "accepted")
            with database.connect() as db:
                other = db.execute(
                    "SELECT customer_id FROM campaign_drafts WHERE run_id=(SELECT run_id FROM campaign_reports WHERE id=?) AND status='validated' AND customer_id!=? LIMIT 1",
                    (self.report_id, self.customer_id),
                ).fetchone()[0]
            self.assertEqual(
                self.submit({**self.body, "customerId": other}).status_code, 429
            )

    def test_smtp_transport_uses_tls_and_hides_sensitive_errors(self):
        config = settings()
        email = message(
            config.sender, config.recipient, "Test", "Body", "<test@example.test>"
        )
        client = MagicMock()
        client.send_message.return_value = {}
        with patch("backend.integrations.email.smtplib.SMTP", return_value=client):
            send_mail(config, email)
        client.starttls.assert_called_once()
        client.login.assert_called_once_with(config.username, config.password)
        client.send_message.assert_called_once_with(
            email, from_addr=config.sender, to_addrs=[config.recipient]
        )
        client.send_message.side_effect = TimeoutError("fake-secret")
        with patch("backend.integrations.email.smtplib.SMTP", return_value=client):
            with self.assertRaises(MailError) as failure:
                send_mail(config, email)
        self.assertTrue(failure.exception.uncertain)
        self.assertNotIn("fake-secret", str(failure.exception))

        client.login.side_effect = smtplib.SMTPAuthenticationError(535, b"fake-secret")
        with patch("backend.integrations.email.smtplib.SMTP", return_value=client):
            with self.assertRaises(MailError) as failure:
                send_mail(config, email)
        self.assertFalse(failure.exception.uncertain)
        self.assertNotIn("fake-secret", str(failure.exception))

    def test_preview_is_short_html_with_signature_and_exact_mime_parts(self):
        preview = self.client.get(
            f"/campaign-reports/{self.report_id}/email-preview",
            params={"customerId": self.customer_id},
            headers=self.headers,
        )
        self.assertEqual(preview.status_code, 200, preview.text)
        value = preview.json()
        self.assertIn("<h1", value["html"])
        self.assertIn("<h2", value["html"])
        self.assertIn("<strong", value["html"])
        self.assertIn("Hi Harshil,", value["text"])
        self.assertIn("Kind regards,\nHarshil Sangani", value["text"])
        self.assertLess(len(value["text"].split()), 160)
        self.review()
        self.assertEqual(
            self.submit({**self.body, "presentationHash": "a" * 64}).status_code, 409
        )
        self.assertEqual(
            self.submit({**self.body, "presentationHash": value["hash"]}).json()[
                "status"
            ],
            "accepted",
        )
        email = self.send.call_args.args[1]
        self.assertTrue(email.is_multipart())
        self.assertEqual(
            email.get_body(preferencelist=("html",)).get_content().strip(),
            value["html"].strip(),
        )
        self.assertEqual(
            email.get_body(preferencelist=("plain",)).get_content().strip(),
            value["text"].strip(),
        )
        with database.connect() as db:
            row = db.execute(
                "SELECT html_body,presentation_version FROM campaign_email_deliveries"
            ).fetchone()
        self.assertEqual(row["html_body"], value["html"])
        self.assertEqual(row["presentation_version"], value["version"])

    def test_email_presentation_escapes_source_text(self):
        from backend.features.campaigns.email_presentation import render

        product = dict(
            name="<script>bad</script>",
            annualFeeMinor=149900,
            benefits={"one": "<img src=x onerror=alert(1)>"},
        )
        value = render(product, ["one"], "<b>Harshil</b>", "<i>Signature</i>")
        self.assertNotIn("<script>", value["html"])
        self.assertNotIn("<img", value["html"])
        self.assertIn("&lt;b&gt;Harshil&lt;/b&gt;", value["html"])
        self.assertIn("₹1,499.00", value["text"])

    def test_revised_layout_keeps_legacy_receipt_and_replays_new_receipt(self):
        self.review()
        original = self.submit().json()
        with database.connect() as db:
            old_hash = db.execute(
                "SELECT content_hash FROM campaign_drafts WHERE run_id=(SELECT run_id FROM campaign_reports WHERE id=?) AND customer_id=?",
                (self.report_id, self.customer_id),
            ).fetchone()[0]
            db.execute(
                "UPDATE campaign_email_deliveries SET draft_hash=?,presentation_version='plain-v1',html_body=NULL WHERE id=?",
                (old_hash, original["id"]),
            )
        revised = self.submit().json()
        self.assertNotEqual(original["id"], revised["id"])
        self.assertEqual(revised["presentationVersion"], "card-email-html-v2")
        self.assertEqual(revised, self.submit().json())
        self.assertEqual(self.send.call_count, 2)
        with database.connect() as db:
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM campaign_email_deliveries").fetchone()[
                    0
                ],
                2,
            )


if __name__ == "__main__":
    unittest.main()
