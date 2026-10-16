"""Campaign acceptance on disposable storage; no working-store or model writes."""

import hashlib
import json
import sqlite3
import tempfile
import unittest
import uuid
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from backend.app import app
from backend.core import database as database
from backend.core.security import Identity, current_identity
from backend.features.campaigns.data import encode, generate_batch, readiness
from backend.features.campaigns.jobs import (
    claim,
    create_campaign,
    enqueue,
    publish,
    work_once,
)
from backend.features.campaigns.rules import (
    build_features,
    products_at,
    screen,
    validate_batch,
)
from backend.features.campaigns.worker import enqueue_scheduled
from backend.integrations.ai import LocalProvider, provider_override


class CampaignTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="campaign-acceptance-")
        cls.original_path = database.DB_PATH
        target = Path(cls.directory.name) / "application.sqlite3"
        with (
            sqlite3.connect(
                cls.original_path.resolve().as_uri() + "?mode=ro", uri=True
            ) as source,
            sqlite3.connect(target) as dest,
        ):
            source.backup(dest)
        database.DB_PATH = target
        database.initialize()
        cls.batch = generate_batch(200, 731)["id"]
        build_features(cls.batch)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        database.DB_PATH = cls.original_path
        cls.directory.cleanup()

    def setUp(self):
        self.identity = current_identity.set(
            Identity("local-customer_operator", "analyst")
        )
        self.provider = provider_override.set(LocalProvider())

    def tearDown(self):
        provider_override.reset(self.provider)
        current_identity.reset(self.identity)

    def campaign(self):
        return create_campaign(
            "October synthetic card campaign",
            dict(
                datasetId="meridian",
                period="2026-10",
                batchId=self.batch,
                productIds=[],
                sampleRewrites=0,
            ),
            str(uuid.uuid4()),
        )

    def accepted(self):
        campaign = self.campaign()
        run = enqueue(campaign["id"], str(uuid.uuid4()))
        return campaign, run

    def complete(self):
        campaign, run = self.accepted()
        self.assertTrue(work_once())
        with database.connect() as db:
            stored = dict(
                db.execute(
                    "SELECT * FROM campaign_runs WHERE id=?", (run["id"],)
                ).fetchone()
            )
        self.assertEqual(stored["status"], "ready", stored["error"])
        return campaign, stored

    def test_generator_is_idempotent_and_original_sources_stay_unchanged(self):
        with database.connect() as db:
            before = {
                table: db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                for table in (
                    "customers",
                    "accounts",
                    "customer_master",
                    "customer_profiles",
                    "transactions",
                    "loans",
                    "cashflow_events",
                    "loan_payments",
                )
            }
        second = generate_batch(200, 731)
        self.assertTrue(second["replayed"])
        self.assertEqual(second["id"], self.batch)
        self.complete()
        with database.connect() as db:
            after = {
                table: db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                for table in before
            }
        self.assertEqual(before, after)
        self.assertEqual(len(second["manifest"]["generatedPeriods"]), 6)
        self.assertEqual(
            len(second["manifest"]["cohort"]), len(set(second["manifest"]["cohort"]))
        )

    def test_unknown_evidence_and_rule_boundaries(self):
        with database.connect() as db:
            products = products_at(db, "2026-09-30")
            feature = json.loads(
                db.execute(
                    "SELECT payload FROM campaign_features WHERE batch_id=? LIMIT 1",
                    (self.batch,),
                ).fetchone()[0]
            )
        valid = {
            **feature,
            "score": 720,
            "thinFile": False,
            "incomeMonths": 12,
            "averageIncomeMinor": 4500000,
            "monthlyObligationMinor": 2025000,
            "debtRatioBps": 4500,
            "obligationsComplete": True,
            "holdingsComplete": True,
            "heldProducts": [],
            "collateralMinor": 0,
            "overduePrincipalMinor": 0,
            "categoryShareBps": {"Travel": 1500, "Shopping": 0, "All": 10000},
        }
        self.assertEqual(screen(valid, products)["product"]["id"], "CARD-TRAVEL")
        self.assertEqual(
            screen({**valid, "debtRatioBps": 4501}, products)["status"], "no_match"
        )
        self.assertEqual(
            screen({**valid, "score": None}, products)["status"], "insufficient_data"
        )
        self.assertEqual(
            screen({**valid, "holdingsComplete": False}, products)["status"],
            "insufficient_data",
        )
        self.assertEqual(
            screen({**valid, "heldProducts": ["CARD-TRAVEL"]}, products)["status"],
            "no_match",
        )
        self.assertEqual(
            screen(
                {**valid, "thinFile": True, "score": None, "collateralMinor": 2500000},
                products,
            )["product"]["id"],
            "CARD-ENTRY",
        )
        self.assertEqual(
            screen(
                {**valid, "thinFile": True, "score": None, "collateralMinor": 0},
                products,
            )["status"],
            "no_match",
        )

    def test_published_credit_fields_cannot_change_without_a_new_batch(self):
        with database.connect() as db:
            row = db.execute(
                "SELECT * FROM campaign_credit_profiles WHERE batch_id=? LIMIT 1",
                (self.batch,),
            ).fetchone()
            db.execute(
                "UPDATE campaign_credit_profiles SET monthly_obligation_minor=1 WHERE batch_id=? AND customer_id=?",
                (self.batch, row["customer_id"]),
            )
        try:
            with database.connect() as db:
                with self.assertRaisesRegex(
                    ValueError, "published campaign input changed"
                ):
                    validate_batch(db, self.batch)
        finally:
            with database.connect() as db:
                db.execute(
                    "UPDATE campaign_credit_profiles SET monthly_obligation_minor=? WHERE batch_id=? AND customer_id=?",
                    (row["monthly_obligation_minor"], self.batch, row["customer_id"]),
                )

    def test_idempotency_conflicts_and_natural_run_deduplication(self):
        campaign = self.campaign()
        request = str(uuid.uuid4())
        first = enqueue(campaign["id"], request)
        self.assertEqual(first["id"], enqueue(campaign["id"], request)["id"])
        self.assertEqual(first["id"], enqueue(campaign["id"], str(uuid.uuid4()))["id"])
        other = self.campaign()
        with self.assertRaises(Exception) as raised:
            enqueue(other["id"], request)
        self.assertEqual(raised.exception.status_code, 409)
        work_once()

    def test_complete_report_has_reconciled_counts_drafts_and_one_notification_per_recipient(
        self,
    ):
        campaign, run = self.complete()
        with database.connect() as db:
            report = db.execute(
                "SELECT * FROM campaign_reports WHERE run_id=?", (run["id"],)
            ).fetchone()
            payload = json.loads(report["payload"])
            counts = payload["counts"]
            self.assertEqual(counts["selected"], 200)
            self.assertEqual(
                counts["selected"], counts["analyzed"] + counts["insufficientData"]
            )
            self.assertEqual(
                counts["prospects"], counts["contactable"] + counts["suppressed"]
            )
            self.assertEqual(counts["drafts"], counts["contactable"])
            self.assertEqual(counts["emailsSent"], 0)
            self.assertGreater(counts["drafts"], 0)
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM staff_notifications WHERE report_id=?",
                    (report["id"],),
                ).fetchone()[0],
                2,
            )
            html = db.execute(
                "SELECT html FROM report_files WHERE report_id=?", (report["id"],)
            ).fetchone()[0]
            self.assertEqual(
                hashlib.sha256(html.encode()).hexdigest(), report["content_hash"]
            )
        self.assertEqual(enqueue(campaign["id"], run["request_id"])["id"], run["id"])
        self.assertFalse(work_once())

    def test_expired_worker_lease_recovers_same_run(self):
        campaign, run = self.accepted()
        first = claim("interrupted-worker")
        self.assertEqual(first[0], run["id"])
        self.assertIsNone(claim("other-worker"))
        with database.connect() as db:
            db.execute(
                "UPDATE campaign_runs SET lease_until='2000-01-01' WHERE id=?",
                (run["id"],),
            )
        self.assertTrue(work_once())
        with database.connect() as db:
            stored = db.execute(
                "SELECT * FROM campaign_runs WHERE id=?", (run["id"],)
            ).fetchone()
        self.assertEqual(stored["status"], "ready")
        self.assertEqual(stored["attempt"], 2)

    def test_cancellation_before_publication_leaves_no_report_or_notification(self):
        campaign, run = self.accepted()

        def cancel_then_publish(run_id, token, specification, checkpoint):
            with database.connect() as db:
                db.execute(
                    "UPDATE campaign_runs SET cancel_requested=1 WHERE id=?", (run_id,)
                )
            return publish(run_id, token, specification, checkpoint)

        with patch("backend.features.campaigns.jobs.publish", cancel_then_publish):
            work_once()
        with database.connect() as db:
            stored = db.execute(
                "SELECT * FROM campaign_runs WHERE id=?", (run["id"],)
            ).fetchone()
            self.assertEqual(stored["status"], "cancelled")
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM campaign_reports WHERE run_id=?", (run["id"],)
                ).fetchone()[0],
                0,
            )

    def test_invalid_ai_claims_fall_back_and_remain_labeled(self):
        class InvalidProvider(LocalProvider):
            name = "vertex"
            external = True
            model = "fake-test-model"

            def draft_card_template(self, product, reason=""):
                result = super().draft_card_template(product, reason)
                result.body += " Guaranteed pre-approved with 99 percent rewards."
                return result

        token = provider_override.set(InvalidProvider())
        try:
            campaign, run = self.complete()
        finally:
            provider_override.reset(token)
        with database.connect() as db:
            report = json.loads(
                db.execute(
                    "SELECT payload FROM campaign_reports WHERE run_id=?", (run["id"],)
                ).fetchone()[0]
            )
        self.assertTrue(report["warnings"])
        self.assertLessEqual(report["modelCalls"], 3)
        self.assertTrue(
            all(item["provider"] == "local" for item in report["providers"])
        )
        self.assertNotIn("99 percent", encode(report))

    def test_report_scope_does_not_bind_chat_and_cross_actor_details_are_denied(self):
        campaign, run = self.complete()
        response = self.client.get(
            "/campaign-reports/" + run["report_id"],
            headers={
                "x-risklens-role": "customer_operator",
                "x-risklens-session": "not-a-valid-recovery-key",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["canReadDetails"])
        denied = self.client.get(
            "/campaign-reports/" + run["report_id"],
            headers={"x-risklens-role": "analyst"},
        )
        self.assertEqual(denied.status_code, 403)
        worker_spoof = self.client.get(
            "/card-campaigns", headers={"x-risklens-role": "campaign_worker"}
        )
        self.assertEqual(worker_spoof.status_code, 403)

    def test_review_is_revision_bound_and_does_not_send_or_change_report_hash(self):
        campaign, run = self.complete()
        headers = {"x-risklens-role": "admin"}
        report = self.client.get(
            "/campaign-reports/" + run["report_id"], headers=headers
        ).json()
        body = dict(
            revision=report["reviewRevision"],
            contentHash=report["contentHash"],
            decision="changes_requested",
            note="Review the proposed offer descriptions.",
        )
        response = self.client.post(
            "/campaign-reports/" + report["id"] + "/review", headers=headers, json=body
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["contentHash"], report["contentHash"])
        self.assertEqual(response.json()["counts"]["emailsSent"], 0)
        self.assertEqual(
            self.client.post(
                "/campaign-reports/" + report["id"] + "/review",
                headers=headers,
                json=body,
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                "/campaign-reports/" + report["id"] + "/review",
                headers=headers,
                json={**body, "decision": "reviewed"},
            ).status_code,
            409,
        )
        with database.connect() as db:
            self.assertEqual(
                db.execute(
                    "SELECT revision FROM card_campaigns WHERE id=?", (campaign["id"],)
                ).fetchone()[0],
                2,
            )
        self.assertEqual(
            self.client.post(
                "/campaign-reports/" + report["id"] + "/review",
                headers={"x-risklens-role": "customer_operator"},
                json=body,
            ).status_code,
            403,
        )

    def test_withdrawal_before_publication_suppresses_existing_draft(self):
        campaign, run = self.accepted()
        withdrew = []

        def withdraw_then_publish(run_id, token, specification, checkpoint):
            with database.connect() as db:
                customer = db.execute(
                    "SELECT customer_id FROM campaign_candidates WHERE run_id=? AND contact_status='allowed' LIMIT 1",
                    (run_id,),
                ).fetchone()[0]
                db.execute(
                    "INSERT INTO marketing_consent_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        str(uuid.uuid4()),
                        "meridian-demo",
                        "meridian",
                        customer,
                        None,
                        "email",
                        "credit_card_offers",
                        "withdrawn",
                        "2026-10-01",
                        "2026-10-01",
                        "Test explicit withdrawal",
                        "local-admin",
                        "2026-10-01",
                    ),
                )
                withdrew.append(customer)
            return publish(run_id, token, specification, checkpoint)

        with patch("backend.features.campaigns.jobs.publish", withdraw_then_publish):
            work_once()
        with database.connect() as db:
            self.assertEqual(
                db.execute(
                    "SELECT status FROM campaign_drafts WHERE run_id=? AND customer_id=?",
                    (run["id"], withdrew[0]),
                ).fetchone()[0],
                "suppressed",
            )
            report = json.loads(
                db.execute(
                    "SELECT payload FROM campaign_reports WHERE run_id=?", (run["id"],)
                ).fetchone()[0]
            )
            self.assertEqual(
                report["counts"]["drafts"], report["counts"]["contactable"]
            )

    def test_scheduler_is_opt_in_idempotent_and_does_not_invent_new_months(self):
        campaign = self.campaign()
        october = datetime(2026, 10, 1, 9, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
        self.assertEqual(enqueue_scheduled(october), 0)
        with database.connect() as db:
            db.execute(
                "UPDATE card_campaigns SET schedule_enabled=1 WHERE id=?",
                (campaign["id"],),
            )
        self.assertEqual(enqueue_scheduled(october), 1)
        self.assertEqual(enqueue_scheduled(october), 0)
        work_once()
        november = datetime(2026, 11, 1, 9, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
        self.assertEqual(enqueue_scheduled(november), 0)
        with database.connect() as db:
            config = json.loads(
                db.execute(
                    "SELECT configuration FROM card_campaigns WHERE id=?",
                    (campaign["id"],),
                ).fetchone()[0]
            )
            self.assertIn("Waiting for source coverage", config["scheduleStatus"])
            db.execute(
                "UPDATE card_campaigns SET schedule_enabled=0 WHERE id=?",
                (campaign["id"],),
            )
        self.assertFalse(readiness("bankshield")["ready"])
        self.assertFalse(readiness("meridian", "2026-11")["ready"])

    def test_viewer_can_read_assigned_summary_but_not_customer_drafts_or_download(self):
        campaign, run = self.complete()
        with database.connect() as db:
            recipients = encode(
                ["local-customer_operator", "local-admin", "local-viewer"]
            )
            db.execute(
                "UPDATE campaign_reports SET recipients=? WHERE id=?",
                (recipients, run["report_id"]),
            )
        headers = {"x-risklens-role": "viewer"}
        response = self.client.get(
            "/campaign-reports/" + run["report_id"], headers=headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("sampleDrafts", response.json())
        self.assertFalse(response.json()["canReadDetails"])
        self.assertEqual(
            self.client.get(
                "/campaign-reports/" + run["report_id"] + "/download", headers=headers
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get(
                "/card-campaigns/"
                + campaign["id"]
                + "/runs/"
                + run["id"]
                + "/candidates",
                headers=headers,
            ).status_code,
            403,
        )

    def test_staff_remove_only_their_own_notifications(self):
        with database.connect() as db:
            report = db.execute("SELECT id FROM campaign_reports LIMIT 1").fetchone()
        if report is None:
            _, run = self.complete()
            report_id = run["report_id"]
        else:
            report_id = report["id"]
        operator = "NOTICE-" + "a" * 24
        admin = "NOTICE-" + "b" * 24
        with database.connect() as db:
            db.execute(
                "DELETE FROM staff_notifications WHERE id IN (?,?)", (operator, admin)
            )
            db.execute(
                "INSERT INTO staff_notifications(id,tenant,recipient,report_id,type,title,created_at) VALUES(?,?,?,?,?,?,?)",
                (
                    operator,
                    "meridian-demo",
                    "local-customer_operator",
                    report_id,
                    "inbox_removal_test",
                    "Operator notice",
                    "2026-10-14T00:00:00Z",
                ),
            )
            db.execute(
                "INSERT INTO staff_notifications(id,tenant,recipient,report_id,type,title,created_at) VALUES(?,?,?,?,?,?,?)",
                (
                    admin,
                    "meridian-demo",
                    "local-admin",
                    report_id,
                    "inbox_removal_test",
                    "Admin notice",
                    "2026-10-14T00:00:00Z",
                ),
            )
        operator_headers = {"x-risklens-role": "customer_operator"}
        admin_headers = {"x-risklens-role": "admin"}
        self.assertEqual(
            self.client.delete(
                "/staff-notifications/not-a-notice", headers=operator_headers
            ).status_code,
            404,
        )
        stolen = self.client.delete(
            "/staff-notifications/" + admin, headers=operator_headers
        )
        self.assertEqual(stolen.status_code, 404)
        removed = self.client.delete(
            "/staff-notifications/" + operator, headers=operator_headers
        )
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(removed.json(), {"id": operator, "removed": True})
        self.assertEqual(
            self.client.delete(
                "/staff-notifications/" + operator, headers=operator_headers
            ).status_code,
            404,
        )
        self.assertTrue(
            any(
                item["id"] == admin
                for item in self.client.get(
                    "/staff-notifications", headers=admin_headers
                ).json()
            )
        )
        cleared = self.client.delete("/staff-notifications", headers=admin_headers)
        self.assertEqual(cleared.status_code, 200)
        self.assertGreaterEqual(cleared.json()["removed"], 1)
        self.assertFalse(
            any(
                item["id"] == admin
                for item in self.client.get(
                    "/staff-notifications", headers=admin_headers
                ).json()
            )
        )
