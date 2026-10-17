"""Role restrictions apply to HTTP requests and direct domain tools."""

import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import app
from backend.core import database
from backend.core.security import Identity, current_identity
from backend.features.customers import quality
from backend.features.imports import service as imports
from backend.features.knowledge import service as policies

ADMIN_ACTIONS = [
    ("POST", "/data/imports/file"),
    ("POST", "/data/imports/review"),
    ("POST", "/data/imports/apply"),
    ("POST", "/data/imports/preview"),
    ("POST", "/data/imports/confirm"),
    ("POST", "/policies"),
    ("POST", "/data/customers"),
    ("PATCH", "/data/customers/CUS-test"),
    ("DELETE", "/data/customers/CUS-test"),
    ("POST", "/approvals/APPROVAL-test/decision"),
    ("POST", "/kyc/customer/CUS-test"),
    ("PATCH", "/kyc/KYC-test"),
    ("PATCH", "/preferences/CUS-test"),
    ("POST", "/maintenance/CUS-test/accounts"),
    ("POST", "/maintenance/CUS-test/policies"),
    ("PATCH", "/maintenance/CUS-test/policies/POL-test"),
    ("POST", "/maintenance/CUS-test/payments"),
    ("POST", "/maintenance/CUS-test/reverse"),
    ("POST", "/card-campaigns/products"),
    ("POST", "/card-campaigns/consent"),
    ("POST", "/card-campaigns/CMP-test/schedule"),
    ("POST", "/campaign-reports/RPT-test/review"),
    ("POST", "/campaign-reports/RPT-test/test-email"),
]


class AdminTaskTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="admin-tasks-")
        self.original = database.DB_PATH
        database.DB_PATH = Path(self.directory.name) / "roles.sqlite3"
        database.initialize()
        with database.connect() as db:
            db.execute(
                "INSERT INTO datasets VALUES(?,?)",
                (
                    "meridian",
                    json.dumps(
                        dict(
                            id="meridian",
                            name="Role test",
                            version="role-test-v1",
                            currency="INR",
                            periods=["2026-09"],
                            regions=["Ahmedabad"],
                            coverage=dict(
                                customers=0,
                                accounts=0,
                                transactions=0,
                                loans=0,
                                completeCustomerChains=0,
                            ),
                            limitations=[],
                        )
                    ),
                ),
            )
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        database.DB_PATH = self.original
        self.directory.cleanup()

    def test_all_admin_mutations_deny_viewer_analyst_and_legacy_staff_before_validation(
        self,
    ):
        for role in ("viewer", "analyst", "customer_operator"):
            for method, path in ADMIN_ACTIONS:
                with self.subTest(role=role, method=method, path=path):
                    response = self.client.request(
                        method, path, headers={"x-risklens-role": role}, json={}
                    )
                    self.assertEqual(response.status_code, 403, response.text)
        with database.connect() as db:
            for table in (
                "customer_profiles",
                "policy_documents",
                "file_import_uploads",
                "file_import_reviews",
                "import_previews",
            ):
                self.assertEqual(
                    db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0], 0
                )

    def test_domain_tools_cannot_bypass_admin_import_or_policy_permissions(self):
        for role in ("viewer", "analyst", "customer_operator"):
            token = current_identity.set(Identity("local-" + role, role))
            try:
                for operation in (
                    imports.upload,
                    imports.review,
                    imports.apply,
                    quality.preview,
                    quality.confirm,
                    policies.ingest,
                ):
                    with self.subTest(role=role, tool=operation.__name__):
                        with self.assertRaises(PermissionError):
                            operation(None)
            finally:
                current_identity.reset(token)

    def test_admin_can_publish_shared_policy_while_all_roles_keep_search_access(self):
        body = dict(
            id="POL-ROLE-TEST",
            version="v1",
            title="Role review policy",
            category="Compliance",
            markdown="## Customer review\nKnow your customer requires staff review of the supplied identity documents.",
        )
        headers = {"x-risklens-role": "admin"}
        response = self.client.post("/policies", headers=headers, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(
            self.client.post("/policies", headers=headers, json=body).json()["replayed"]
        )
        for role in ("viewer", "analyst", "admin"):
            response = self.client.get(
                "/policies/search?q=know%20your%20customer",
                headers={"x-risklens-role": role},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["results"][0]["documentId"], body["id"])

    def test_admin_permissions_are_assigned_without_granting_them_to_other_roles(self):
        admin_only = {
            "data_import",
            "policy_manage",
            "customer_write",
            "approval_review",
            "campaign_admin",
            "campaign_review",
        }
        for role in ("viewer", "analyst", "customer_operator", "admin"):
            identity = self.client.get(
                "/identity", headers={"x-risklens-role": role}
            ).json()
            actual = set(identity["permissions"])
            self.assertEqual(
                actual & admin_only, admin_only if role == "admin" else set()
            )
            if role in ("analyst", "customer_operator", "admin"):
                self.assertTrue(
                    {"analyze", "form_read", "form_submit", "campaign_run"} <= actual
                )
            else:
                self.assertEqual(actual, {"read", "campaign_summary"})
