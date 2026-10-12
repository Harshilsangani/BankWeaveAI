import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend import database
from backend.app import app
from backend.import_data import seed_meridian
from backend.security import Identity, current_identity
from backend.forms import add_customer


class SecurityTests(unittest.TestCase):
    def test_three_canonical_roles_keep_legacy_staff_identity_without_write_access(self):
        from backend.security import PERMISSIONS
        self.assertEqual(set(PERMISSIONS),{'viewer','analyst','admin'})
        legacy=self.client.get('/identity',headers={'x-risklens-role':'customer_operator'}).json()
        self.assertEqual(legacy['role'],'analyst');self.assertEqual(legacy['actorId'],'local-customer_operator')
        self.assertEqual(legacy['permissions'],self.client.get('/identity',headers={'x-risklens-role':'analyst'}).json()['permissions'])
        self.assertNotIn('customer_write',legacy['permissions'])
        self.assertEqual(self.client.get('/identity',headers={'x-risklens-role':'superadmin'}).status_code,403)

    def test_agents_and_correction_tool_enforce_viewer_permission(self):
        from backend import agents
        from backend.form_quality import save_correction
        token=current_identity.set(Identity('test-viewer','viewer'))
        try:
            for node in (agents.general_chat,agents.database_agent,agents.knowledge_agent,agents.customer_update):
                with self.assertRaises(PermissionError):node({})
            with self.assertRaises(PermissionError):save_correction('FORM-none',{})
        finally:current_identity.reset(token)
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.original=database.DB_PATH
        database.DB_PATH=Path(cls.temp.name)/'roles.sqlite3'
        database.initialize(); seed_meridian()
        cls.client=TestClient(app)
    @classmethod
    def tearDownClass(cls):
        cls.client.close(); database.DB_PATH=cls.original; cls.temp.cleanup()

    def test_viewer_and_analyst_cannot_bypass_customer_write_tools(self):
        for role in ('viewer','analyst','customer_operator'):
            headers={'x-risklens-role':role}
            self.assertEqual(self.client.get('/data/customers',headers=headers).status_code,200)
            for method,path in [('POST','/data/customers'),('PATCH','/data/customers/CUS-00001'),('DELETE','/data/customers/CUS-00001')]:
                self.assertEqual(self.client.request(method,path,headers=headers,json={}).status_code,403)
            token=current_identity.set(Identity('test-'+role,role))
            try:
                with self.assertRaises(PermissionError): add_customer('untrusted',{})
            finally: current_identity.reset(token)
        self.assertEqual(self.client.post('/analyst',headers={'x-risklens-role':'viewer'},json={'query':'Show fraud'}).status_code,403)
        with database.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM customer_profiles').fetchone()[0],10000)
            self.assertGreaterEqual(db.execute('SELECT COUNT(*) FROM access_audit WHERE status=403').fetchone()[0],9)

    def test_production_rejects_development_identity_and_session_owner_is_checked(self):
        with patch.dict(os.environ,{'RISKLENS_ENV':'production'}):
            self.assertEqual(self.client.get('/health').status_code,200)
            for role in ('viewer','analyst','customer_operator','admin'):
                result=self.client.get('/data/customers',headers={'x-risklens-role':role})
                self.assertEqual(result.status_code,403)
                self.assertIn('development',result.json()['error'])
        headers={'x-risklens-session':'staff-session-owner-test','x-risklens-role':'analyst'}
        self.assertEqual(self.client.get('/session',headers=headers).status_code,200)
        self.assertEqual(self.client.get('/session',headers={**headers,'x-risklens-role':'viewer'}).status_code,403)
        self.assertEqual(self.client.get('/identity',headers={'x-risklens-role':'customer_operator'}).json()['permissions'],['analyze','form_read','form_submit','read'])
