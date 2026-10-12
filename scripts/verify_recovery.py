"""Three fresh processes verify local database and graph restart recovery."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def phase(name):
    import fitz
    from backend.database import initialize,connect,STORAGE
    from backend.import_data import seed_meridian
    from fastapi.testclient import TestClient
    from backend.app import app
    initialize()
    client=TestClient(app)
    staff={'x-risklens-role':'customer_operator','x-risklens-session':'recovery-staff-workspace-0001'}
    admin={'x-risklens-role':'admin','x-risklens-session':'recovery-admin-workspace-0001'}
    marker=STORAGE/'recovery.json'
    if name=='prepare':
        seed_meridian()
        with connect() as db:
            db.execute("UPDATE customer_profiles SET city='Preserved test edit' WHERE id='CUS-00001'")
            original_count=db.execute('SELECT COUNT(*) FROM customer_profiles').fetchone()[0]
        document=fitz.open(); page=document.new_page()
        page.insert_text((50,80),'Full Name: Restart Recovery Customer\nDate of Birth: 1990-05-12',fontsize=14)
        content=document.tobytes(); document.close()
        response=client.post('/forms',headers=staff,files={'file':('restart.pdf',content,'application/pdf')})
        assert response.status_code==200,response.text
        draft=response.json()
        response=client.post('/customers',headers=staff,json=dict(threadId=draft['threadId'],draftId=draft['id'],fields=draft['fields'],reviewRevision=draft['revision'],confirmed=True))
        assert response.status_code==200,response.text
        request=response.json()
        with connect() as db:assert db.execute('SELECT COUNT(*) FROM customer_profiles').fetchone()[0]==original_count
        marker.write_text(json.dumps({**draft,'request':request,'originalCount':original_count}))
    elif name=='resume':
        seed_meridian()  # Optional reseed cannot replace reviewed profiles.
        draft=json.loads(marker.read_text())
        body=dict(decision='approve',revision=draft['request']['revision'],confirmed=True,note='Admin reviewed the persisted fictional application after restart.')
        path='/approvals/'+draft['request']['id']+'/decision'
        response=client.post(path,headers=admin,json=body)
        assert response.status_code==200,response.text
        result=response.json()
        replay=client.post(path,headers=admin,json=body).json()
        assert result['customerId']==replay['customerId']
        marker.write_text(json.dumps({**draft,'customerId':result['customerId']}))
    else:
        draft=json.loads(marker.read_text())
        response=client.post('/approvals/'+draft['request']['id']+'/decision',headers=admin,json=dict(decision='approve',revision=draft['request']['revision'],confirmed=True,note='Replaying the original approved customer request after restart.'))
        assert response.status_code==200,response.text
        result=response.json()
        assert result['customerId']==draft['customerId']
        with connect() as db:
            assert db.execute("SELECT city FROM customer_profiles WHERE id='CUS-00001'").fetchone()[0]=='Preserved test edit'
            assert db.execute('SELECT COUNT(*) FROM customer_profiles').fetchone()[0]==draft['originalCount']+1
            assert db.execute('SELECT status FROM form_drafts WHERE id=?',(draft['id'],)).fetchone()[0]=='saved'
        restored=client.get('/session',headers=staff).json()['messages'][-1]['blocks'][0]['draft']
        assert restored['approval']['status']=='approved'
        assert restored['customerId']==draft['customerId']
    client.close()
    print('PASS: '+name)


if __name__=='__main__':
    if len(sys.argv)>1:
        sys.path.insert(0,str(ROOT)); phase(sys.argv[1])
    else:
        with tempfile.TemporaryDirectory(prefix='risklens-recovery-') as directory:
            shutil.copy2(ROOT/'backend/storage/meridian.json',Path(directory)/'meridian.json')
            env={**os.environ,'RISKLENS_STORAGE_DIR':directory,'RISKLENS_DB':str(Path(directory)/'bank.sqlite3'),'RISKLENS_CHECKPOINT_DB':str(Path(directory)/'checkpoints.sqlite3'),'RISKLENS_PROVIDER':'local','RISKLENS_ENV':'development'}
            for name in ('prepare','resume','verify'):
                subprocess.run([sys.executable,__file__,name],cwd=ROOT,env=env,check=True,timeout=180)
