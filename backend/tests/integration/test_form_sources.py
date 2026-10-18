"""Original attachment download preserves bytes and staff/workspace boundaries."""

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


class FormSourceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.previous = database.DB_PATH
        database.DB_PATH = Path(self.directory.name) / "forms.sqlite3"
        database.initialize()
        self.client = TestClient(app)
        self.headers = {
            "x-risklens-role": "analyst",
            "x-risklens-session": "source-session-0123456789",
        }
        self.content = Path(
            "frontend/tests/fixtures/meridian-three-page-application.pdf"
        ).read_bytes()
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
                    "FORM-source123",
                    "../Meridian résumé.pdf",
                    "# Extracted",
                    "{}",
                    "2026-10-18",
                ),
            )
            db.execute(
                "INSERT INTO session_artifacts VALUES(?,?)",
                (self.headers["x-risklens-session"], "FORM-source123"),
            )
            db.execute(
                "INSERT INTO form_sources VALUES(?,?,?,?)",
                (
                    "FORM-source123",
                    self.content,
                    "application/pdf",
                    hashlib.sha256(self.content).hexdigest(),
                ),
            )

    def tearDown(self):
        self.client.close()
        database.DB_PATH = self.previous
        self.directory.cleanup()

    def get(self, headers=None):
        return self.client.get(
            "/forms/FORM-source123/source", headers=headers or self.headers
        )

    def test_owned_download_is_exact_original_with_safe_attachment_headers(self):
        with patch(
            "backend.integrations.ai.get_provider",
            side_effect=AssertionError("Download must not call a model"),
        ):
            response = self.get()
        self.assertEqual(response.status_code, 200, response.text[:100])
        self.assertEqual(response.content, self.content)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertEqual(
            response.headers["x-content-sha256"],
            hashlib.sha256(self.content).hexdigest(),
        )
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertIn(
            "attachment; filename*=UTF-8''Meridian%20r%C3%A9sum%C3%A9.pdf",
            response.headers["content-disposition"],
        )

    def test_another_workspace_cannot_download_even_with_same_staff_role(self):
        response = self.get(
            {**self.headers, "x-risklens-session": "another-session-0123456789"}
        )
        self.assertEqual(response.status_code, 403)
        self.assertNotIn(self.content[:10], response.content)

    def test_another_staff_identity_cannot_claim_owning_workspace(self):
        self.assertEqual(
            self.get({**self.headers, "x-risklens-role": "admin"}).status_code, 403
        )

    def test_legacy_extraction_without_original_has_explicit_404(self):
        with database.connect() as db:
            db.execute("DELETE FROM form_sources")
        self.assertEqual(self.get().status_code, 404)

    def test_integrity_mismatch_prevents_download(self):
        with database.connect() as db:
            db.execute("UPDATE form_sources SET content=?", (b"different",))
        self.assertEqual(self.get().status_code, 409)

    def test_image_source_keeps_its_original_mime_and_bytes(self):
        content = Path("frontend/public/demo/customer-form.png").read_bytes()
        with database.connect() as db:
            db.execute(
                "UPDATE form_sources SET content=?,media_type=?,sha256=?",
                (content, "image/png", hashlib.sha256(content).hexdigest()),
            )
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, content)
        self.assertEqual(response.headers["content-type"], "image/png")

    def test_new_extraction_retains_original_before_returning_draft(self):
        from backend.features.forms.service import read_form
        from backend.integrations.ai.local import LocalProvider

        with patch(
            "backend.integrations.ai.get_provider", return_value=LocalProvider()
        ):
            draft = read_form(self.content, "new-application.pdf")
        self.assertTrue(draft["sourceAvailable"])
        with database.connect() as db:
            saved = db.execute(
                "SELECT content,sha256 FROM form_sources WHERE draft_id=?",
                (draft["id"],),
            ).fetchone()
        self.assertEqual(saved["content"], self.content)
        self.assertEqual(saved["sha256"], hashlib.sha256(self.content).hexdigest())
