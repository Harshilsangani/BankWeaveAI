import io
import json
import tempfile
import unittest
import uuid
from pathlib import Path
from zipfile import ZipFile

from fastapi.testclient import TestClient
from backend import database
from backend.app import app
from backend.structured_imports import parse_file


class StructuredImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='risklens-imports-')
        cls.previous=database.DB_PATH;database.DB_PATH=Path(cls.temp.name)/'test.sqlite3';database.initialize()
        meta=dict(id='meridian',name='Meridian test',version='test-v1',currency='INR',periods=['2026-09'],regions=['Ahmedabad'],coverage=dict(customers=1,accounts=1,loans=0,transactions=0,completeCustomerChains=0),limitations=[])
        with database.connect() as db:
            db.execute('INSERT INTO datasets VALUES(?,?)',('meridian',json.dumps(meta)))
            db.execute('INSERT INTO customers VALUES(?,?)',('meridian','CUS-BASE'))
            db.execute('INSERT INTO accounts VALUES(?,?,?,?)',('meridian','ACC-BASE','CUS-BASE','2026-01-01'))
            db.execute('INSERT INTO customer_master VALUES(?,?,?,?,?,?,?,?)',('meridian','CUS-BASE','BR-AHM','Ahmedabad','Ahmedabad','30-39','Professional',700))
        cls.client=TestClient(app,headers={'x-risklens-role':'admin'})

    @classmethod
    def tearDownClass(cls):
        cls.client.close();database.DB_PATH=cls.previous;cls.temp.cleanup()

    def setUp(self): self.headers={'x-risklens-session':str(uuid.uuid4())}

    def upload(self,content,filename='records.csv',headers=None):
        return self.client.post('/data/imports/file',data={'datasetId':'meridian'},files={'file':(filename,content)},headers=headers or self.headers)

    def review(self,upload,entity,sheet=None,mapping=None,headers=None):
        source=next(s for s in upload['sheets'] if sheet is None or s['name']==sheet)
        return self.client.post('/data/imports/review',json=dict(uploadId=upload['id'],entity=entity,sheet=source['name'],mapping=mapping or {h:h for h in source['headers']}),headers=headers or self.headers)

    def apply(self,preview,headers=None):
        return self.client.post('/data/imports/apply',json=dict(previewId=preview['id'],sourceHash=preview['sourceHash'],confirmed=True),headers=headers or self.headers)

    def test_linked_workbook_append_provenance_history_and_replay(self):
        workbook=Path('public/demo/banking-import-template.xlsx').read_bytes()
        response=self.upload(workbook,'records.xlsx');self.assertEqual(response.status_code,200,response.text)
        upload=response.json();self.assertEqual(len(upload['sheets']),4)
        blocked=self.review(upload,'transactions','Transactions').json();self.assertFalse(blocked['canImport'])
        self.assertIn('Account parent',str(blocked['errors']))
        for entity,sheet in [('customers','Customers'),('accounts','Accounts'),('transactions','Transactions'),('loans','Loans')]:
            response=self.review(upload,entity,sheet);self.assertEqual(response.status_code,200,response.text)
            preview=response.json();self.assertTrue(preview['canImport'],preview)
            receipt=self.apply(preview);self.assertEqual(receipt.status_code,200,receipt.text)
            self.assertEqual(receipt.json()['importedRows'],1)
            self.assertTrue(self.apply(preview).json()['replayed'])
        with database.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM customers WHERE id='CUS-IMPORT-001'").fetchone()[0],1)
            self.assertEqual(db.execute("SELECT account_id,amount_minor,occurred_at FROM transactions WHERE id='TX-IMPORT-001'").fetchone()[0],'ACC-IMPORT-001')
            self.assertEqual(db.execute("SELECT COUNT(*) FROM record_import_sources").fetchone()[0],4)
        customer=self.client.get('/data/customers/CUS-IMPORT-001',headers=self.headers).json()
        self.assertEqual(customer['source'],'Spreadsheet import');self.assertEqual(customer['links']['transactions'],1)
        self.assertEqual(customer['status'],'pending_verification')
        history=self.client.get('/data/imports/history',headers=self.headers).json()
        self.assertEqual(sum(r['importedRows'] for r in history),4)
        with database.connect() as db:
            meta=json.loads(db.execute("SELECT metadata FROM datasets WHERE id='meridian'").fetchone()[0])
            self.assertEqual(meta['baseFixtureVersion'],'test-v1')
        filtered=self.client.get('/data/customers?source=uploaded',headers=self.headers).json()
        self.assertEqual(filtered['stats']['uploaded'],1)

    def test_customer_mapping_duplicate_detection_and_atomic_failure(self):
        content=b'Customer Number,Name,DOB,Email\nCUS-MAPPED,New Person,1990-01-01,new@example.test\nCUS-BAD,Invalid Person,2990-01-01,bad@example.test'
        upload=self.upload(content).json()
        mapping={'id':'Customer Number','fullName':'Name','dateOfBirth':'DOB','email':'Email'}
        preview=self.review(upload,'customers',mapping=mapping).json()
        self.assertEqual(preview['validRows'],1);self.assertEqual(preview['errors'][0]['row'],3)
        self.assertEqual(self.apply(preview).status_code,400)
        with database.connect() as db:self.assertIsNone(db.execute("SELECT 1 FROM customers WHERE id='CUS-MAPPED'").fetchone())
        invalid=self.review(upload,'customers',mapping={**mapping,'phone':'Email'})
        self.assertEqual(invalid.status_code,400)

    def test_ownership_roles_hash_and_stale_parent_revalidation(self):
        unique='ACC-'+uuid.uuid4().hex
        upload=self.upload(f'id,customer_id,opened_on\n{unique},CUS-BASE,2026-01-01'.encode()).json()
        foreign={'x-risklens-session':str(uuid.uuid4())}
        self.assertEqual(self.review(upload,'accounts',headers=foreign).status_code,403)
        preview=self.review(upload,'accounts').json()
        self.assertEqual(self.apply(preview,headers={**self.headers,'x-risklens-role':'analyst'}).status_code,403)
        self.assertEqual(self.client.post('/data/imports/apply',json=dict(previewId=preview['id'],sourceHash='a'*64,confirmed=True),headers=self.headers).status_code,400)
        with database.connect() as db:db.execute('INSERT INTO accounts VALUES(?,?,?,?)',('meridian',unique,'CUS-BASE','2026-01-01'))
        self.assertEqual(self.apply(preview).status_code,400)
        self.assertEqual(self.client.get('/data/imports/history',headers=foreign).json(),[])
        self.assertEqual(self.upload(b'id\nA',headers={**self.headers,'x-risklens-role':'viewer'}).status_code,403)

    def test_loan_default_months_and_imported_customer_region_reach_analytics(self):
        upload=self.upload(f'id,customer_id,branch_id,loan_type,principal,default_months\nLN-{uuid.uuid4().hex},CUS-IMPORT-001,BR-AHM,Personal,12000,2026-09'.encode()).json()
        preview=self.review(upload,'loans').json();self.assertTrue(preview['canImport'],preview)
        self.assertEqual(self.apply(preview).status_code,200)
        from backend.loans import aggregate,evidence_rows
        scope=dict(datasetId='meridian',period='2026-09',region='Ahmedabad',customerId='CUS-IMPORT-001')
        result=aggregate(scope,'2026-09');self.assertEqual(result['total'],2);self.assertEqual(result['affected'],1)
        self.assertEqual(len(evidence_rows(scope,0,8)),1)
        from backend.repayments import seed,ledger
        seed();self.assertEqual(ledger(scope)['installments'],0);self.assertEqual(ledger(scope)['loansWithoutObservations'],2)

    def test_stale_dataset_version_requires_new_preview(self):
        upload=self.upload(f'id,customer_id,opened_on\nACC-{uuid.uuid4().hex},CUS-BASE,2026-01-01'.encode()).json()
        preview=self.review(upload,'accounts').json()
        with database.connect() as db:
            meta=json.loads(db.execute("SELECT metadata FROM datasets WHERE id='meridian'").fetchone()[0]);meta['version']=uuid.uuid4().hex
            db.execute('UPDATE datasets SET metadata=? WHERE id=?',(json.dumps(meta),'meridian'))
        self.assertEqual(self.apply(preview).status_code,409)

    def test_duplicate_people_in_one_sheet_require_manual_review(self):
        upload=self.upload(b'id,fullName,dateOfBirth\nCUS-PERSON-ONE,Same Person,1995-03-15\nCUS-PERSON-TWO,Same Person,1995-03-15').json()
        preview=self.review(upload,'customers').json()
        self.assertFalse(preview['canImport']);self.assertEqual(preview['errors'][0]['row'],3)
        self.assertIn('duplicate person',str(preview['errors']))
        self.assertEqual(self.apply(preview).status_code,400)

    def test_unsupplied_score_stays_unknown_and_excel_dates_use_reviewed_timezone(self):
        record_id='TX-'+uuid.uuid4().hex
        upload=self.upload(f'id,account_id,occurred_at,amount,currency,region,merchant,channel,new_device,flagged\n{record_id},ACC-BASE,2026-09-15T10:30:00,1.25,INR,Ahmedabad,Demo,Online,0,0'.encode()).json()
        preview=self.review(upload,'transactions').json();self.assertTrue(preview['canImport'],preview)
        self.assertEqual(self.apply(preview).status_code,200)
        with database.connect() as db:
            row=db.execute('SELECT amount_minor,score,occurred_at FROM transactions WHERE id=?',(record_id,)).fetchone()
            self.assertEqual(row['amount_minor'],125);self.assertIsNone(row['score']);self.assertEqual(row['occurred_at'],'2026-09-15T05:00:00Z')

    def test_parser_rejects_sql_formulas_duplicate_headers_and_oversize(self):
        for data,name in [(b'DROP TABLE customers','customers.sql'),(b'id,id\nA,A','records.csv'),(b'id\n=HYPERLINK("https://example.test")','records.csv'),(b'not a zip','records.xlsx'),(b'a'*(5*1024*1024+1),'large.csv')]:
            self.assertEqual(self.upload(data,name).status_code,400,name)
        workbook=Path('public/demo/banking-import-template.xlsx').read_bytes()
        for change in ['formula','far-cell']:
            out=io.BytesIO()
            with ZipFile(io.BytesIO(workbook)) as source,ZipFile(out,'w') as target:
                for name in source.namelist():
                    content=source.read(name)
                    if name=='xl/worksheets/sheet1.xml':
                        insertion=b'<x:row r="3"><x:c r="A3"><x:f>1+1</x:f><x:v>2</x:v></x:c></x:row>' if change=='formula' else b'<x:row r="3000"><x:c r="A3000"><x:v>2</x:v></x:c></x:row>'
                        self.assertIn(b'</x:sheetData>',content)
                        content=content.replace(b'</x:sheetData>',insertion+b'</x:sheetData>')
                    target.writestr(name,content)
            self.assertEqual(self.upload(out.getvalue(),'unsafe.xlsx').status_code,400,change)
        semicolon=self.upload(b'id;customer_id;opened_on\nACC-SEMICOLON;CUS-BASE;2026-01-01').json()
        self.assertEqual(semicolon['sheets'][0]['headers'],['id','customer_id','opened_on'])


if __name__=='__main__': unittest.main()
