import json
import sqlite3
import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import fitz
from fastapi.testclient import TestClient
from langgraph.checkpoint.sqlite import SqliteSaver

from backend.app import app
from backend.core import database as database
from backend.core import security as security
from backend.features.forms.service import add_customer
from backend.workflows import analyst as agents


class AdminApprovalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.previous = database.DB_PATH
        database.DB_PATH = Path(cls.temp.name) / "test.sqlite3"
        database.initialize()
        meta = dict(
            id="meridian",
            name="Meridian test",
            version="test-v1",
            currency="INR",
            periods=["2026-09"],
            regions=["Ahmedabad"],
            limitations=[],
            coverage={},
        )
        with database.connect() as db:
            db.execute(
                "INSERT INTO datasets VALUES(?,?)", ("meridian", json.dumps(meta))
            )
        cls.connection = sqlite3.connect(
            Path(cls.temp.name) / "checkpoints.sqlite3", check_same_thread=False
        )
        cls.old_graph = agents.graph
        agents.graph = agents._builder.compile(checkpointer=SqliteSaver(cls.connection))
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        agents.graph = cls.old_graph
        cls.connection.close()
        database.DB_PATH = cls.previous
        cls.temp.cleanup()

    def setUp(self):
        self.staff = {
            "x-risklens-role": "customer_operator",
            "x-risklens-session": str(uuid.uuid4()),
        }
        self.admin = {
            "x-risklens-role": "admin",
            "x-risklens-session": str(uuid.uuid4()),
        }

    def count(self):
        with database.connect() as db:
            return db.execute("SELECT COUNT(*) FROM customer_profiles").fetchone()[0]

    def upload(self):
        document = fitz.open()
        page = document.new_page()
        page.insert_text(
            (50, 80),
            f"Full Name: Approval Demo {uuid.uuid4().hex[:8]}\nDate of Birth: 1990-05-12",
            fontsize=14,
        )
        content = document.tobytes()
        document.close()
        response = self.client.post(
            "/forms",
            headers=self.staff,
            files={"file": ("demo.pdf", content, "application/pdf")},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def submit(self, draft, **overrides):
        return self.client.post(
            "/customers",
            headers=self.staff,
            json=dict(
                threadId=draft["threadId"],
                draftId=draft["id"],
                confirmed=True,
                fields=draft["fields"],
                reviewRevision=draft["revision"],
                **overrides,
            ),
        )

    def decision(self, request, decision="approve", headers=None, **values):
        return self.client.post(
            f"/approvals/{request['id']}/decision",
            headers=headers or self.admin,
            json=dict(
                decision=decision,
                revision=request["revision"],
                confirmed=True,
                note="Reviewed the fictional application against its extracted source.",
                **values,
            ),
        )

    def test_staff_submit_does_not_write_admin_approves_atomically_and_replays(self):
        draft = self.upload()
        before = self.count()
        token = security.current_identity.set(security.Identity("local-admin", "admin"))
        try:
            with self.assertRaises(PermissionError):
                add_customer(draft["id"], draft["fields"])
        finally:
            security.current_identity.reset(token)
        submitted = self.submit(draft)
        self.assertEqual(submitted.status_code, 200, submitted.text)
        request = submitted.json()
        self.assertEqual(request["status"], "pending")
        self.assertEqual(self.count(), before)
        token = security.current_identity.set(security.Identity("local-admin", "admin"))
        try:
            with self.assertRaises(PermissionError):
                agents.customer_update({"draft": draft})
        finally:
            security.current_identity.reset(token)
        for invalid in [
            dict(confirmed=False),
            dict(note="     "),
            dict(revision=request["revision"] + 1),
        ]:
            body = dict(
                decision="approve",
                revision=request["revision"],
                confirmed=True,
                note="Explicit reviewed application.",
                **{},
            )
            body.update(invalid)
            response = self.client.post(
                "/approvals/" + request["id"] + "/decision",
                headers=self.admin,
                json=body,
            )
            self.assertIn(response.status_code, (400, 409))
            self.assertEqual(self.count(), before)
        self.assertEqual(self.submit(draft).json()["id"], request["id"])
        self.assertEqual(
            self.client.patch(
                "/forms/" + draft["id"], headers=self.staff, json=draft["fields"]
            ).status_code,
            400,
        )
        restored = self.client.get("/session", headers=self.staff).json()["messages"][
            -1
        ]["blocks"][0]["draft"]
        self.assertEqual(restored["status"], "submitted")
        self.assertEqual(restored["approval"]["id"], request["id"])
        self.assertEqual(self.decision(request, headers=self.staff).status_code, 403)
        approved = self.decision(request)
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(self.count(), before + 1)
        self.assertEqual(approved.json()["decidedBy"], "local-admin")
        token = security.current_identity.set(security.Identity("local-admin", "admin"))
        try:
            self.assertEqual(
                agents.customer_update({"draft": draft})["result"]["customerId"],
                approved.json()["customerId"],
            )
        finally:
            security.current_identity.reset(token)
        self.assertEqual(self.count(), before + 1)
        self.assertEqual(
            self.decision(request).json()["customerId"], approved.json()["customerId"]
        )
        self.assertEqual(self.count(), before + 1)
        self.assertEqual(self.decision(request, "reject").status_code, 409)
        database.initialize()
        saved = self.client.get("/session", headers=self.staff).json()["messages"][-1][
            "blocks"
        ][0]["draft"]
        self.assertEqual(saved["status"], "saved")
        self.assertEqual(saved["approval"]["status"], "approved")
        self.assertFalse(
            agents.graph.get_state(
                {"configurable": {"thread_id": draft["threadId"]}}
            ).next
        )
        self.assertEqual(
            [event["kind"] for event in approved.json()["events"]],
            ["Submitted", "Approved"],
        )
        profile = self.client.get(
            "/data/customers/" + approved.json()["customerId"], headers=self.admin
        ).json()
        self.assertEqual(
            self.client.request(
                "DELETE",
                "/data/customers/" + profile["id"],
                headers=self.admin,
                json={"revision": profile["revision"]},
            ).status_code,
            200,
        )
        historical = self.client.get(
            "/approvals/" + request["id"], headers=self.staff
        ).json()
        self.assertEqual(historical["status"], "approved")
        self.assertTrue(historical["customerDeleted"])
        self.assertEqual(self.submit(draft).status_code, 400)

    def test_rejection_is_persistent_without_a_customer(self):
        draft = self.upload()
        before = self.count()
        request = self.submit(draft).json()
        rejected = self.decision(request, "reject")
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(self.count(), before)
        self.assertIsNone(rejected.json()["customerId"])
        self.assertEqual(self.decision(request, "reject").status_code, 200)
        self.assertEqual(self.decision(request).status_code, 409)
        self.assertEqual(self.submit(draft).json()["status"], "rejected")
        self.assertEqual(
            self.client.get("/session", headers=self.staff).json()["messages"][-1][
                "blocks"
            ][0]["draft"]["status"],
            "rejected",
        )

    def test_admin_can_review_the_kyc_case_from_a_staff_submission(self):
        draft = self.upload()
        request = self.submit(draft).json()
        approved = self.decision(request).json()
        cases = self.client.get(
            "/kyc/customer/" + approved["customerId"], headers=self.admin
        )
        self.assertEqual(cases.status_code, 200, cases.text)
        case = next(case for case in cases.json() if case["draftId"] == draft["id"])
        body = dict(
            revision=case["revision"],
            status="Needs information",
            kind="Reviewer note",
            note="Admin received the approved application; identity evidence remains pending.",
        )
        updated = self.client.patch("/kyc/" + case["id"], headers=self.admin, json=body)
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertFalse(updated.json()["identityVerified"])
        self.assertEqual(
            self.client.patch(
                "/kyc/" + case["id"], headers=self.staff, json=body
            ).status_code,
            403,
        )
        with patch.object(
            security.identity_adapter,
            "resolve",
            return_value=security.Identity(
                "other-admin", "admin", tenant="other-bank", adapter="test"
            ),
        ):
            self.assertEqual(
                self.client.patch("/kyc/" + case["id"], json=body).status_code, 403
            )

    def test_only_admin_can_mutate_banking_data_even_with_direct_api_calls(self):
        paths = [
            ("POST", "/data/customers"),
            ("PATCH", "/data/customers/CUS-NONE"),
            ("DELETE", "/data/customers/CUS-NONE"),
            ("POST", "/data/imports/apply"),
            ("POST", "/data/imports/confirm"),
            ("POST", "/maintenance/CUS-NONE/accounts"),
            ("PATCH", "/preferences/CUS-NONE"),
            ("POST", "/kyc/customer/CUS-NONE"),
        ]
        for role in ("viewer", "analyst", "customer_operator"):
            headers = {"x-risklens-role": role}
            for method, path in paths:
                self.assertEqual(
                    self.client.request(
                        method, path, headers=headers, json={}
                    ).status_code,
                    403,
                    (role, path),
                )
            token = security.current_identity.set(
                security.Identity("local-" + role, role)
            )
            try:
                with self.assertRaises(PermissionError):
                    add_customer("FORM-none", {})
            finally:
                security.current_identity.reset(token)
        created = self.client.post(
            "/data/customers",
            headers=self.admin,
            json={
                "fields": {"fullName": "Manual Admin Demo", "dateOfBirth": "1990-01-01"}
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        customer = created.json()
        removed = self.client.request(
            "DELETE",
            "/data/customers/" + customer["id"],
            headers=self.admin,
            json={"revision": customer["revision"]},
        )
        self.assertEqual(removed.status_code, 200, removed.text)
        self.assertNotIn(
            "customer_write",
            self.client.get("/identity", headers=self.staff).json()["permissions"],
        )
        self.assertIn(
            "approval_review",
            self.client.get("/identity", headers=self.admin).json()["permissions"],
        )
        with patch.dict("os.environ", {"RISKLENS_ENV": "production"}):
            self.assertEqual(
                self.client.get("/identity", headers=self.admin).status_code, 403
            )

    def test_staff_and_tenant_ownership_no_workspace_bypass(self):
        draft = self.upload()
        request = self.submit(draft).json()
        other = {
            "x-risklens-role": "customer_operator",
            "x-risklens-session": str(uuid.uuid4()),
        }
        self.assertEqual(
            self.client.get("/approvals/" + request["id"], headers=other).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/approvals?status=all", headers=other).json()["rows"], []
        )
        body = dict(
            threadId=draft["threadId"],
            draftId=draft["id"],
            confirmed=True,
            fields=draft["fields"],
        )
        self.assertEqual(
            self.client.post("/customers", headers=other, json=body).status_code, 400
        )
        self.assertEqual(
            self.client.post(
                "/customers", headers={"x-risklens-role": "analyst"}, json=body
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.get(
                "/approvals/" + request["id"], headers=self.admin
            ).status_code,
            200,
        )
        with patch.object(
            security.identity_adapter,
            "resolve",
            return_value=security.Identity(
                "other-admin", "admin", tenant="other-bank", adapter="test"
            ),
        ):
            self.assertEqual(
                self.client.get("/approvals/" + request["id"]).status_code, 403
            )
            self.assertEqual(self.decision(request).status_code, 403)

    def test_stale_and_altered_reviews_block_writes(self):
        draft = self.upload()
        edited = {**draft["fields"], "city": "Changed before submission"}
        self.client.patch("/forms/" + draft["id"], headers=self.staff, json=edited)
        self.assertEqual(self.submit(draft).status_code, 409)
        review = self.client.get("/session", headers=self.staff).json()["messages"][-1][
            "blocks"
        ][0]["draft"]
        request = self.submit(review).json()
        before = self.count()
        with database.connect() as db:
            db.execute(
                "UPDATE form_drafts SET markdown=markdown || ' Changed' WHERE id=?",
                (draft["id"],),
            )
        self.assertEqual(self.decision(request).status_code, 409)
        self.assertEqual(self.count(), before)

    def test_duplicate_revalidation_requires_an_admin_decision(self):
        draft = self.upload()
        request = self.submit(draft).json()
        original = self.decision(request).json()["customerId"]
        duplicate = self.upload()
        self.client.patch(
            "/forms/" + duplicate["id"], headers=self.staff, json=draft["fields"]
        )
        duplicate = self.client.get("/session", headers=self.staff).json()["messages"][
            -1
        ]["blocks"][0]["draft"]
        self.assertEqual(self.submit(duplicate).status_code, 400)
        request = self.submit(
            duplicate,
            duplicateDecision="reuse",
            duplicateReason="Same fictional applicant reviewed.",
        ).json()
        before = self.count()
        self.assertEqual(self.decision(request).status_code, 400)
        linked = self.decision(
            request,
            duplicateDecision="reuse",
            duplicateReason="Admin verified the same fictional applicant.",
        )
        self.assertEqual(linked.status_code, 200, linked.text)
        self.assertEqual(linked.json()["customerId"], original)
        self.assertEqual(self.count(), before)

    def test_concurrent_approval_and_failed_audit_cannot_partially_commit(self):
        draft = self.upload()
        request = self.submit(draft).json()
        before = self.count()
        with patch(
            "backend.features.forms.approvals.event",
            side_effect=RuntimeError("Injected audit failure"),
        ):
            with self.assertRaises(RuntimeError):
                self.decision(request)
        self.assertEqual(self.count(), before)
        self.assertEqual(
            self.client.get("/approvals/" + request["id"], headers=self.admin).json()[
                "status"
            ],
            "pending",
        )
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: self.decision(request), range(2)))
        self.assertTrue(
            all(result.status_code == 200 for result in results),
            [r.text for r in results],
        )
        self.assertEqual(
            results[0].json()["customerId"], results[1].json()["customerId"]
        )
        self.assertEqual(self.count(), before + 1)


if __name__ == "__main__":
    unittest.main()
