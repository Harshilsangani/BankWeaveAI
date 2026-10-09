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
    from backend.agents import run_upload,confirm_customer
    initialize()
    marker=STORAGE/'recovery.json'
    if name=='prepare':
        seed_meridian()
        with connect() as db:
            db.execute("UPDATE customer_profiles SET city='Preserved test edit' WHERE id='CUS-00001'")
        document=fitz.open(); page=document.new_page()
        page.insert_text((50,80),'Full Name: Restart Recovery Customer\nDate of Birth: 1990-05-12',fontsize=14)
        path=STORAGE/'temporary-form.pdf'; document.save(path); document.close()
        draft=run_upload(path,'restart.pdf'); path.unlink()
        marker.write_text(json.dumps(draft))
    elif name=='resume':
        seed_meridian()  # Optional reseed cannot replace reviewed profiles.
        draft=json.loads(marker.read_text())
        result=confirm_customer(draft['threadId'],draft['id'],draft['fields'])
        replay=confirm_customer(draft['threadId'],draft['id'],draft['fields'])
        assert result['customerId']==replay['customerId']
        marker.write_text(json.dumps({**draft,'customerId':result['customerId']}))
    else:
        draft=json.loads(marker.read_text())
        result=confirm_customer(draft['threadId'],draft['id'],draft['fields'])
        assert result['customerId']==draft['customerId']
        with connect() as db:
            assert db.execute("SELECT city FROM customer_profiles WHERE id='CUS-00001'").fetchone()[0]=='Preserved test edit'
            assert db.execute('SELECT COUNT(*) FROM customer_profiles').fetchone()[0]==1201
            assert db.execute('SELECT status FROM form_drafts WHERE id=?',(draft['id'],)).fetchone()[0]=='saved'
    print('PASS: '+name)


if __name__=='__main__':
    if len(sys.argv)>1:
        sys.path.insert(0,str(ROOT)); phase(sys.argv[1])
    else:
        with tempfile.TemporaryDirectory(prefix='risklens-recovery-') as directory:
            shutil.copy2(ROOT/'backend/storage/meridian.json',Path(directory)/'meridian.json')
            env={**os.environ,'RISKLENS_STORAGE_DIR':directory,'RISKLENS_DB':str(Path(directory)/'bank.sqlite3'),'RISKLENS_CHECKPOINT_DB':str(Path(directory)/'checkpoints.sqlite3'),'RISKLENS_PROVIDER':'local','RISKLENS_ENV':'development'}
            for name in ('prepare','resume','verify'):
                subprocess.run([sys.executable,__file__,name],cwd=ROOT,env=env,check=True,timeout=60)
