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
        for role in ('viewer','analyst'):
            headers={'x-risklens-role':role}
            self.assertEqual(self.client.get('/data/customers',headers=headers).status_code,200)
            for method,path in [('POST','/data/customers'),('PATCH','/data/customers/CUS-00001'),('DELETE','/data/customers/CUS-00001'),('POST','/customers')]:
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
            for role in ('viewer','analyst','customer_operator'):
                result=self.client.get('/data/customers',headers={'x-risklens-role':role})
                self.assertEqual(result.status_code,403)
                self.assertIn('development',result.json()['error'])
        headers={'x-risklens-session':'staff-session-owner-test','x-risklens-role':'analyst'}
        self.assertEqual(self.client.get('/session',headers=headers).status_code,200)
        self.assertEqual(self.client.get('/session',headers={**headers,'x-risklens-role':'viewer'}).status_code,403)
        self.assertEqual(self.client.get('/identity',headers={'x-risklens-role':'customer_operator'}).json()['permissions'],['analyze','customer_write','form_read','read'])
