"""Extraction provenance and conservative duplicate review; never auto-merge people."""
import json
import re
from pydantic import ValidationError
from .forms import CustomerFields
from .database import connect


def normalized(value):
    return re.sub(r'\s+',' ',value.strip()).casefold()


def duplicates(db,fields):
    dob=fields.get('dateOfBirth')
    if not dob:
        return []
    candidates=db.execute("SELECT id,full_name,date_of_birth,email,phone FROM customer_profiles WHERE dataset='meridian' AND date_of_birth=?",(dob,)).fetchall()
    results=[]
    for row in candidates:
        reasons=[]
        if normalized(row['full_name']) == normalized(fields.get('fullName','')): reasons.append('Same normalized name and date of birth')
        if fields.get('email') and normalized(row['email'] or '')==normalized(fields['email']): reasons.append('Same email and date of birth')
        if fields.get('phone') and re.sub(r'\D','',row['phone'] or '')==re.sub(r'\D','',fields['phone']): reasons.append('Same phone and date of birth')
        if reasons: results.append(dict(customerId=row['id'],name=row['full_name'],reasons=reasons))
    return results[:10]


def provenance(fields,markdown,provider):
    result={}
    pages=re.split(r'## Page (\d+)\s*',markdown)
    for key,value in fields.items():
        page=None
        if value:
            for index in range(1,len(pages)-1,2):
                if value in pages[index+1]: page=int(pages[index]); break
        result[key]=dict(page=page,method='Label extraction' if provider=='local' else 'Model proposed',status='candidate' if value else 'missing',reason='Verify against the original; no calibrated confidence is available.' if value else 'No value supplied by extraction.')
        try: CustomerFields.model_validate({key:value})
        except ValidationError:
            result[key].update(status='invalid',reason='The extracted value fails the field format check. Correct it before saving.')
    return result


def quality(db,draft_id,fields=None):
    row=db.execute('SELECT * FROM form_drafts WHERE id=?',(draft_id,)).fetchone()
    if not row: raise ValueError('Form draft not found.')
    extracted=db.execute('SELECT * FROM form_quality WHERE draft_id=?',(draft_id,)).fetchone()
    current=fields or json.loads(row['fields'])
    original=json.loads(extracted['extracted_fields']) if extracted else current
    sources=json.loads(extracted['provenance']) if extracted else provenance(original,row['markdown'],'local')
    for key,value in current.items():
        if value!=original.get(key): sources[key]={**sources[key], 'status':'corrected','reason':'Corrected by the reviewer; original extraction remains in version history.'}
    return dict(revision=extracted['revision'] if extracted else 1,provenance=sources,possibleDuplicates=duplicates(db,current))


def save_correction(draft_id,fields):
    from .analytics import now
    from .security import actor
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT * FROM form_drafts WHERE id=?',(draft_id,)).fetchone()
        if not row or row['status']!='pending': raise ValueError('Only a pending review can be corrected.')
        previous=json.loads(row['fields'])
        db.execute('INSERT OR IGNORE INTO form_quality VALUES(?,?,?,?,?,?)',(draft_id,None,'local',row['fields'],json.dumps(provenance(previous,row['markdown'],'local')),1))
        revision=db.execute('SELECT revision FROM form_quality WHERE draft_id=?',(draft_id,)).fetchone()[0]
        if previous != fields:
            revision+=1
            db.execute('UPDATE form_drafts SET fields=? WHERE id=?',(json.dumps(fields),draft_id))
            db.execute('UPDATE form_quality SET revision=? WHERE draft_id=?',(revision,draft_id))
            db.execute('INSERT INTO form_review_versions VALUES(?,?,?,?,?,?)',(draft_id,revision,json.dumps(fields),actor().actor_id,'Reviewer correction',now()))
        return quality(db,draft_id,fields)


def record_confirmed(db,draft,fields,review,reason):
    from .analytics import now
    from .security import actor
    db.execute('INSERT OR IGNORE INTO form_quality VALUES(?,?,?,?,?,?)',(draft['id'],None,'local',draft['fields'],json.dumps(provenance(json.loads(draft['fields']),draft['markdown'],'local')),review['revision']))
    version=review['revision']+1
    db.execute('UPDATE form_quality SET revision=? WHERE draft_id=?',(version,draft['id']))
    db.execute('INSERT INTO form_review_versions VALUES(?,?,?,?,?,?)',(draft['id'],version,json.dumps(fields),actor().actor_id,'Confirmed review. '+reason[:500],now()))
    return version
