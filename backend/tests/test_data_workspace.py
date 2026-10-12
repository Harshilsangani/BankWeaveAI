import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from backend import database
from backend.app import app
from backend.import_data import seed_meridian, seed_bankshield


class DataWorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="risklens-directory-")
        cls.original = database.DB_PATH
        database.DB_PATH = Path(cls.temp.name) / "test.sqlite3"
        database.initialize(); seed_meridian(); seed_bankshield()
        cls.client = TestClient(app,headers={'x-risklens-role':'admin'})

    @classmethod
    def tearDownClass(cls):
        cls.client.close(); database.DB_PATH = cls.original; cls.temp.cleanup()

    def test_customer_crud_search_conflicts_and_audit(self):
        fields = dict(fullName="Directory Test Customer", dateOfBirth="1990-05-12", city="Ahmedabad", email="directory@example.test")
        added = self.client.post("/data/customers", json={"fields": fields})
        self.assertEqual(added.status_code, 200, added.text)
        customer = added.json(); customer_id = customer["id"]
        self.assertEqual(customer["status"], "pending_verification")
        listing = self.client.get("/data/customers", params={"q": "directory@example.test"}).json()
        self.assertEqual(listing["total"], 1)
        self.assertEqual(listing["rows"][0]["id"], customer_id)
        self.assertEqual(self.client.get("/data/customers", params={"q": "' OR 1=1 --"}).json()["total"], 0)
        updated = self.client.patch(f"/data/customers/{customer_id}", json={"fields": {**fields, "city": "Surat"}, "revision": customer["revision"]})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["fields"]["city"], "Surat")
        stale = self.client.request("DELETE", f"/data/customers/{customer_id}", json={"revision": customer["revision"]})
        self.assertEqual(stale.status_code, 409)
        preferences=self.client.patch('/preferences/'+customer_id,json=dict(revision=0,consent=False,needs=[],minimumCover=0,reason='No declared needs for this fictional customer'))
        self.assertEqual(preferences.status_code,200,preferences.text)
        deleted = self.client.request("DELETE", f"/data/customers/{customer_id}", json={"revision": updated.json()["revision"]})
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get("/data/customers", params={"q": customer_id}).json()["total"], 0)
        with database.connect() as db:
            self.assertIsNone(db.execute("SELECT 1 FROM customers WHERE id=?", (customer_id,)).fetchone())
            self.assertIsNone(db.execute("SELECT 1 FROM customer_preferences WHERE customer_id=?",(customer_id,)).fetchone())
            self.assertIsNotNone(db.execute("SELECT 1 FROM recommendation_runs WHERE customer_id=?",(customer_id,)).fetchone())
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_runs WHERE scope LIKE ?", (f'%{customer_id}%',)).fetchone()[0], 4)

    def test_customer_filters_and_namespace_scoped_investigation(self):
        filtered=self.client.get('/data/customers',params={'source':'synthetic','product':'loans','status':'synthetic'}).json()
        self.assertEqual(filtered['total'],8000)
        branch=filtered['rows'][0]['master']['branchId']
        regional=self.client.get('/data/customers',params={'branch':branch,'product':'loans'}).json()
        self.assertTrue(all(r['master']['branchId']==branch for r in regional['rows']))
        inv=self.client.post('/investigations',json={'riskId':'RSK-002','scope':{'domain':'loans','datasetId':'meridian','customerId':'CUS-00001'}}).json()
        self.assertEqual(inv['scope']['customerId'],'CUS-00001')
        self.assertIn('1 loans in scope',inv['metrics'][2]['detail'])
        evidence=self.client.post('/evidence',json={'scope':inv['scope']}).json()
        self.assertTrue(all(r[4]=='CUS-00001' for r in evidence['rows']))
        bad=self.client.post('/investigations',json={'riskId':'BS-001','scope':{'datasetId':'bankshield','customerId':'CUS-00001','domain':'fraud'}})
        self.assertEqual(bad.status_code,400)
        self.assertEqual(self.client.get('/data/customers',params={'product':'malicious_sql'}).status_code,422)

    def test_validation_and_linked_customer_protection(self):
        for fields in [{"fullName": "X"}, {"fullName": "Test", "dateOfBirth": "2099-01-01"}, {"fullName": "Test", "dateOfBirth": "1990-01-01", "email": "invalid"}]:
            self.assertIn(self.client.post("/data/customers", json={"fields": fields}).status_code, (400, 422))
        result = self.client.post("/data/customers", json={"fields": {"fullName": "Linked Customer", "dateOfBirth": "1990-01-01"}}).json()
        with database.connect() as db:
            db.execute("INSERT INTO accounts VALUES(?,?,?,?)", ("meridian", "TEST-ACCOUNT", result["id"], None))
        response = self.client.request("DELETE", f'/data/customers/{result["id"]}', json={"revision": result["revision"]})
        self.assertEqual(response.status_code, 409)
        self.assertIn("linked accounts", response.json()["detail"])

    def test_source_browsing_currency_pagination_and_allowlist(self):
        first = self.client.get("/data/records", params={"dataset": "bankshield", "table": "transactions"}).json()
        second = self.client.get("/data/records", params={"dataset": "bankshield", "table": "transactions", "offset": 15}).json()
        self.assertEqual(first["total"], 5000)
        self.assertIn("Amount (USD)", first["columns"])
        self.assertIn("$", first["rows"][0][3])
        self.assertFalse({r[0] for r in first["rows"]} & {r[0] for r in second["rows"]})
        self.assertEqual(self.client.get("/data/records", params={"table": "customer_profiles"}).status_code, 422)
        self.assertEqual(self.client.get("/data/records", params={"offset": -1}).status_code, 422)
        self.assertEqual(self.client.post("/data/records", json={"table": "transactions"}).status_code, 405)
        self.assertGreater(self.client.get("/data/records", params={"dataset": "meridian", "table": "devices"}).json()["total"], 0)

    def test_master_customers_keep_shared_ids_and_edits_across_reseed(self):
        directory = self.client.get("/data/customers").json()
        self.assertEqual(directory["stats"]["synthetic"], 10000)
        self.assertEqual(directory["rows"][0]["id"], "CUS-00001")
        customer = self.client.get("/data/customers/CUS-00001").json()
        self.assertEqual(customer["fields"]["fullName"], "Aarav Shah")
        self.assertEqual(customer["source"], "Synthetic dataset")
        self.assertEqual(customer["accounts"][0]["id"], "ACC-00001")
        self.assertEqual(customer["loans"][0]["id"], "LN-00001")
        self.assertTrue(all(tx["accountId"] == "ACC-00001" for tx in customer["transactions"]))
        self.assertEqual(customer["links"]["transactions"], 12)
        changed = self.client.patch("/data/customers/CUS-00001", json={"fields": {**customer["fields"], "address": "Reviewed demo address"}, "revision": customer["revision"]})
        self.assertEqual(changed.status_code, 200)
        seed_meridian()
        self.assertEqual(self.client.get("/data/customers/CUS-00001").json()["fields"]["address"], "Reviewed demo address")
        self.assertEqual(self.client.get("/data/customers").json()["stats"]["synthetic"], 10000)
        with database.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM loans WHERE dataset='meridian'").fetchone()[0], 8000)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM accounts a LEFT JOIN customer_profiles p ON p.id=a.customer_id AND p.dataset=a.dataset WHERE a.dataset='meridian' AND p.id IS NULL").fetchone()[0], 0)


if __name__ == "__main__": unittest.main()
