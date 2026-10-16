import json
import os
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from google.auth import jwt
from google.auth.crypt.es256 import ES256Signer

from backend.core import security as security
from backend.core.iap_identity import IAPIdentity


class StaticKeys:
    def __init__(self, public_key):
        self.public_key = public_key

    def get(self, key_id):
        return {"test-key": self.public_key}


class IAPFixture:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.grants = Path(self.temp.name) / "staff.json"
        self.audience = "/projects/123/global/backendServices/456"
        self.subject = "accounts.google.com:test-staff"
        private_key = ec.generate_private_key(ec.SECP256R1())
        self.signer = ES256Signer(private_key, key_id="test-key")
        public_key = (
            private_key.public_key()
            .public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            .decode()
        )
        self.adapter = IAPIdentity(keys=StaticKeys(public_key))
        self.write_grants()
        self.environment = patch.dict(
            os.environ,
            {
                "RISKLENS_ENV": "production",
                "RISKLENS_IDENTITY_ADAPTER": "iap",
                "RISKLENS_IAP_AUDIENCE": self.audience,
                "RISKLENS_STAFF_GRANTS_FILE": str(self.grants),
            },
        )
        self.environment.start()

    def tearDown(self):
        self.environment.stop()
        self.temp.cleanup()

    def write_grants(self, **overrides):
        grant = dict(
            subject=self.subject,
            email="staff@example.test",
            role="analyst",
            tenant="meridian-demo",
        )
        grant.update(overrides)
        self.grants.write_text(json.dumps(dict(version=1, staff=[grant])))

    def token(self, signer=None, **overrides):
        now = int(time.time())
        claims = dict(
            iss="https://cloud.google.com/iap",
            sub=self.subject,
            email="staff@example.test",
            aud=self.audience,
            iat=now - 10,
            exp=now + 300,
        )
        claims.update(overrides)
        return jwt.encode(signer or self.signer, claims).decode()

    def request(self, token=None, **headers):
        if token is not None:
            headers["x-goog-iap-jwt-assertion"] = token
        return SimpleNamespace(headers=headers)


class IAPIdentityTests(IAPFixture, unittest.TestCase):
    def test_valid_signature_uses_only_server_role_and_stable_subject(self):
        request = self.request(
            self.token(role="admin", tenant="other-bank"),
            **{"x-risklens-role": "admin"},
        )
        identity = self.adapter.resolve(request)
        self.assertEqual(identity.role, "analyst")
        self.assertEqual(identity.tenant, "meridian-demo")
        self.assertEqual(identity.adapter, "iap")
        self.assertTrue(identity.actor_id.startswith("iap-"))
        self.assertEqual(
            identity.actor_id, self.adapter.resolve(self.request(self.token())).actor_id
        )
        self.assertNotEqual(identity.actor_id, "local-customer_operator")

    def test_forged_signature_wrong_audience_issuer_and_times_are_rejected(self):
        attacker = ES256Signer(
            ec.generate_private_key(ec.SECP256R1()), key_id="test-key"
        )
        now = int(time.time())
        invalid = [
            self.token(signer=attacker),
            self.token(aud="another-resource"),
            self.token(iss="https://attacker.invalid"),
            self.token(iat=now - 700, exp=now - 100),
            self.token(iat=now + 120, exp=now + 240),
            self.token(exp=now + 3600),
            self.token(exp="tomorrow"),
            self.token(aud=[self.audience]),
            self.token(sub=""),
            "unsigned-private-token",
        ]
        for token in invalid:
            with self.subTest(tokenKind=invalid.index(token)):
                with self.assertRaisesRegex(
                    PermissionError, "could not be verified"
                ) as caught:
                    self.adapter.resolve(self.request(token))
                self.assertNotIn(token, str(caught.exception))

    def test_unsigned_headers_missing_configuration_and_unknown_modes_fail_closed(self):
        with self.assertRaises(PermissionError):
            self.adapter.resolve(
                self.request(
                    **{
                        "x-risklens-role": "admin",
                        "x-goog-authenticated-user-email": "staff@example.test",
                    }
                )
            )
        with patch.dict(os.environ, {"RISKLENS_IAP_AUDIENCE": ""}):
            with self.assertRaises(PermissionError):
                self.adapter.resolve(self.request(self.token()))
        with patch.dict(os.environ, {"RISKLENS_STAFF_GRANTS_FILE": "relative.json"}):
            with self.assertRaises(PermissionError):
                self.adapter.resolve(self.request(self.token()))
        with patch.dict(os.environ, {"RISKLENS_IDENTITY_ADAPTER": "unsupported"}):
            with self.assertRaises(PermissionError):
                security.ConfiguredIdentity().resolve(self.request())

    def test_grant_revocation_subject_email_and_other_tenant_are_enforced(self):
        self.adapter.resolve(self.request(self.token()))
        for grant in [
            dict(subject="someone-else"),
            dict(email="other@example.test"),
            dict(tenant="other-bank"),
            dict(role="customer_operator"),
        ]:
            self.write_grants(**grant)
            with self.assertRaises(PermissionError):
                self.adapter.resolve(self.request(self.token()))
        self.grants.write_text(json.dumps(dict(version=1, staff=[])))
        with self.assertRaises(PermissionError):
            self.adapter.resolve(self.request(self.token()))
        self.write_grants()
        config = json.loads(self.grants.read_text())
        config["staff"].append(config["staff"][0])
        self.grants.write_text(json.dumps(config))
        with self.assertRaises(PermissionError):
            self.adapter.resolve(self.request(self.token()))

    def test_verified_mode_never_supplies_a_default_identity_to_tools(self):
        token = security.current_identity.set(None)
        try:
            with patch.dict(os.environ, {"RISKLENS_ENV": "development"}):
                with self.assertRaises(PermissionError):
                    security.require("read")
        finally:
            security.current_identity.reset(token)


class IAPAPITests(IAPFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        from fastapi.testclient import TestClient

        from backend.app import app
        from backend.core import database as database

        self.database = database
        self.old_path = database.DB_PATH
        database.DB_PATH = Path(self.temp.name) / "api.sqlite3"
        database.initialize()
        self.patch_adapter = patch.object(security, "identity_adapter", self.adapter)
        self.patch_adapter.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.patch_adapter.stop()
        self.database.DB_PATH = self.old_path
        super().tearDown()

    def headers(self, **claims):
        return {
            "x-goog-iap-jwt-assertion": self.token(**claims),
            "x-risklens-role": "admin",
        }

    def add_second_staff(self):
        config = json.loads(self.grants.read_text())
        config["staff"].append(
            dict(
                subject="accounts.google.com:second-staff",
                email="second@example.test",
                role="admin",
                tenant="meridian-demo",
            )
        )
        self.grants.write_text(json.dumps(config))
        return self.headers(
            sub="accounts.google.com:second-staff", email="second@example.test"
        )

    def test_production_ignores_spoofed_roles_and_enforces_write_permissions(self):
        for role in ("viewer", "analyst"):
            self.write_grants(role=role)
            identity = self.client.get("/identity", headers=self.headers(role="admin"))
            self.assertEqual(identity.status_code, 200, identity.text)
            self.assertEqual(identity.json()["role"], role)
            self.assertEqual(identity.json()["adapter"], "iap")
            self.assertEqual(
                self.client.post(
                    "/data/customers", headers=self.headers(), json={}
                ).status_code,
                403,
            )
            self.assertEqual(
                self.client.post(
                    "/approvals/fake/decision", headers=self.headers(), json={}
                ).status_code,
                403,
            )
        self.write_grants(role="admin")
        # A signed admin reaches input validation; the incomplete request
        # creates no records. An asserted browser role cannot do this.
        self.assertEqual(
            self.client.post(
                "/data/customers", headers=self.headers(), json={}
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.get(
                "/identity", headers={"x-risklens-role": "admin"}
            ).status_code,
            403,
        )

    def test_signed_users_cannot_share_workspaces_and_identity_discovery_ignores_stale_handles(
        self,
    ):
        sid = str(uuid.uuid4())
        first = {**self.headers(), "x-risklens-session": sid}
        self.assertEqual(self.client.get("/session", headers=first).status_code, 200)
        second = {**self.add_second_staff(), "x-risklens-session": sid}
        self.assertEqual(self.client.get("/session", headers=second).status_code, 403)
        identity = self.client.get("/identity", headers=second)
        self.assertEqual(identity.status_code, 200, identity.text)
        self.assertEqual(identity.json()["role"], "admin")
        with self.database.connect() as db:
            owner = db.execute(
                "SELECT owner FROM workspace_sessions WHERE id=?", (sid,)
            ).fetchone()[0]
        self.assertEqual(
            owner, self.adapter.resolve(self.request(self.token())).actor_id
        )

    def test_legacy_workspace_ownership_is_preserved_and_not_implicitly_granted(self):
        sid = str(uuid.uuid4())
        with self.database.connect() as db:
            db.execute(
                "INSERT INTO workspace_sessions VALUES(?,?,?)",
                (sid, "{}", "local-customer_operator"),
            )
        response = self.client.get(
            "/session", headers={**self.headers(), "x-risklens-session": sid}
        )
        self.assertEqual(response.status_code, 403)
        with self.database.connect() as db:
            self.assertEqual(
                db.execute(
                    "SELECT owner FROM workspace_sessions WHERE id=?", (sid,)
                ).fetchone()[0],
                "local-customer_operator",
            )
