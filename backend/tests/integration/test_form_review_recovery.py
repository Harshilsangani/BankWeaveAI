"""Saved form recovery is read-only and stays bound to the owning staff workspace."""

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import app
from backend.core import database
from backend.features.workspaces.sessions import empty


class SavedFormReviewTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="saved-form-review-")
        self.original = database.DB_PATH
        database.DB_PATH = Path(self.directory.name) / "application.sqlite3"
        database.initialize()
        self.client = TestClient(app)
        self.headers = {
            "x-risklens-role": "analyst",
            "x-risklens-session": "recovery-session-0123456789",
        }
        self.fields = dict(
            fullName="Recovery Example",
            dateOfBirth="1990-06-15",
            email="recovery@example.test",
            phone="",
            address="12 Example Road",
            city="Ahmedabad",
            state="Gujarat",
            postalCode="380001",
        )
        with database.connect() as db:
            db.execute(
                "INSERT INTO workspace_sessions VALUES(?,?,?)",
                (
                    self.headers["x-risklens-session"],
                    json.dumps(empty()),
                    "local-analyst",
                ),
            )
            db.execute(
                "INSERT INTO form_drafts(id,filename,markdown,fields,created_at) VALUES(?,?,?,?,?)",
                (
                    "FORM-recovery123",
                    "application.pdf",
                    "# Saved application",
                    json.dumps(self.fields),
                    "2026-10-18T00:00:00Z",
                ),
            )
            db.execute(
                "INSERT INTO session_artifacts VALUES(?,?)",
                (self.headers["x-risklens-session"], "FORM-recovery123"),
            )

    def tearDown(self):
        self.client.close()
        database.DB_PATH = self.original
        self.directory.cleanup()

    def test_pending_review_returns_saved_fields_without_a_model_or_customer_write(
        self,
    ):
        with patch(
            "backend.integrations.ai.get_provider",
            side_effect=AssertionError("Recovery must not call AI"),
        ):
            response = self.client.get("/forms/FORM-recovery123", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        value = response.json()
        self.assertEqual(value["fields"], self.fields)
        self.assertEqual(value["status"], "pending")
        self.assertIsNone(value["approval"])
        self.assertEqual(value["revision"], 1)
        with database.connect() as db:
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM customer_profiles").fetchone()[0], 0
            )
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM form_review_versions").fetchone()[0], 0
            )

    def test_recovery_returns_the_existing_submission_and_final_decision(self):
        snapshot = dict(
            fields=self.fields,
            filename="application.pdf",
            markdown="# Saved application",
            provenance={},
            reviewRevision=1,
            duplicateDecision=None,
            duplicateReason="",
        )
        text = json.dumps(snapshot)
        with database.connect() as db:
            db.execute(
                "UPDATE form_drafts SET status='submitted' WHERE id='FORM-recovery123'"
            )
            db.execute(
                "INSERT INTO admin_approval_requests(id,tenant,requested_by,session_id,draft_id,thread_id,snapshot,snapshot_hash,review_revision,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (
                    "APPROVAL-recovery123",
                    "meridian-demo",
                    "local-analyst",
                    self.headers["x-risklens-session"],
                    "FORM-recovery123",
                    "thread-recovery",
                    text,
                    hashlib.sha256(text.encode()).hexdigest(),
                    1,
                    "pending",
                    "2026-10-18T00:00:00Z",
                ),
            )
        value = self.client.get("/forms/FORM-recovery123", headers=self.headers).json()
        self.assertEqual(value["status"], "submitted")
        self.assertEqual(value["approval"]["id"], "APPROVAL-recovery123")
        with database.connect() as db:
            db.execute(
                "UPDATE admin_approval_requests SET status='rejected',decision_note='Needs a clearer document' WHERE id='APPROVAL-recovery123'"
            )
            db.execute(
                "UPDATE form_drafts SET status='rejected' WHERE id='FORM-recovery123'"
            )
        value = self.client.get("/forms/FORM-recovery123", headers=self.headers).json()
        self.assertEqual(value["approval"]["status"], "rejected")
        self.assertEqual(value["approval"]["decisionNote"], "Needs a clearer document")
        with database.connect() as db:
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM admin_approval_requests").fetchone()[
                    0
                ],
                1,
            )
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM customer_profiles").fetchone()[0], 0
            )

    def test_another_workspace_cannot_read_the_form(self):
        response = self.client.get(
            "/forms/FORM-recovery123",
            headers={
                **self.headers,
                "x-risklens-session": "another-session-0123456789",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertNotIn(self.fields["email"], response.text)

    def test_missing_workspace_and_viewer_are_denied(self):
        for headers, status in (
            ({"x-risklens-role": "analyst"}, 400),
            ({**self.headers, "x-risklens-role": "viewer"}, 403),
            ({**self.headers, "x-risklens-role": "admin"}, 403),
        ):
            with self.subTest(headers=headers):
                response = self.client.get("/forms/FORM-recovery123", headers=headers)
                self.assertEqual(response.status_code, status)
                self.assertNotIn(self.fields["email"], response.text)
