"""Human review case history. Extraction/reference metadata never verifies identity."""
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,ConfigDict,Field
from typing import Literal
from .database import connect
from .analytics import identifier,now
from .security import require,actor
from .operations import owner
from .sessions import form_access
router=APIRouter()

def ensure_form_case(db,draft_id,customer_id=None):
    row=db.execute('SELECT * FROM kyc_cases WHERE source_draft_id=?',(draft_id,)).fetchone()
    if row:
        if customer_id and not row['customer_id']:
            db.execute('UPDATE kyc_cases SET customer_id=?,revision=revision+1 WHERE id=?',(customer_id,row['id']))
            db.execute('INSERT INTO kyc_events VALUES(?,?,?,?,?,?,?)',(identifier('KYC-EVENT'),row['id'],'Profile linked',draft_id,'Profile saved pending verification; extraction is not KYC approval.',actor().actor_id,now()))
        return row['id']
    case_id=identifier('KYC')
    from .sessions import session_key
    identity=actor().actor_id+':'+(session_key.get() or 'local-tools')
    db.execute('INSERT INTO kyc_cases VALUES(?,?,?,?,?,?,?,?)',(case_id,customer_id,draft_id,identity,'Customer application','Needs information',1,now()))
    db.execute('INSERT INTO kyc_events VALUES(?,?,?,?,?,?,?)',(identifier('KYC-EVENT'),case_id,'Extraction received',draft_id,'Application form extracted. Identity/address proof and verification are not established.',actor().actor_id,now()))
    return case_id

def permitted(row):
    if actor().role == 'admin' and row['source_draft_id']:
        with connect() as db:
            shared=db.execute('SELECT 1 FROM admin_approval_requests WHERE draft_id=? AND tenant=?',(row['source_draft_id'],actor().tenant)).fetchone()
        if shared:return
    if row['owner'] != owner():
        raise PermissionError('KYC case belongs to another workspace/staff actor.')
    if row['source_draft_id']:form_access(row['source_draft_id'])

def payload(db,row):
    events=[dict(event) for event in db.execute('SELECT * FROM kyc_events WHERE case_id=? ORDER BY created_at,id',(row['id'],))]
    quality={};source_hash=None
    if row['source_draft_id']:
        from .form_quality import quality as draft_quality
        quality=draft_quality(db,row['source_draft_id'])
        source=db.execute('SELECT source_hash FROM form_quality WHERE draft_id=?',(row['source_draft_id'],)).fetchone()
        source_hash=source[0] if source else None
    supplied={event['kind'] for event in events}
    missing=[kind for kind in ('Identity proof reference','Address proof reference') if kind not in supplied]
    return dict(id=row['id'],customerId=row['customer_id'],draftId=row['source_draft_id'],documentType=row['document_type'],status=row['status'],revision=row['revision'],createdAt=row['created_at'],quality=quality,sourceHash=source_hash,events=events,missingEvidence=missing,identityVerified=False,limitations=['Application extraction and manually recorded references do not establish document authenticity or identity.','Review completion never approves KYC, opens an account or changes the customer verification status. Original upload storage and verified identity checks are deployment decisions.'])

@router.get('/kyc/customer/{customer_id}')
def customer_cases(customer_id:str):
    identity=owner()
    with connect() as db:
        if not db.execute("SELECT 1 FROM customers WHERE dataset='meridian' AND id=?",(customer_id,)).fetchone():raise ValueError('Select an existing customer.')
        if actor().role == 'admin':
            rows=db.execute('SELECT k.* FROM kyc_cases k WHERE k.customer_id=? AND (k.owner=? OR EXISTS(SELECT 1 FROM admin_approval_requests a WHERE a.draft_id=k.source_draft_id AND a.tenant=?)) ORDER BY k.created_at DESC',(customer_id,identity,actor().tenant)).fetchall()
        else:
            rows=db.execute('SELECT * FROM kyc_cases WHERE customer_id=? AND owner=? ORDER BY created_at DESC',(customer_id,identity)).fetchall()
        return [payload(db,row) for row in rows]

class CreateCase(BaseModel):
    model_config=ConfigDict(extra='forbid')
    reason:str=Field(min_length=5,max_length=500)

@router.post('/kyc/customer/{customer_id}')
def create_case(customer_id:str,body:CreateCase):
    require('customer_write');identity=owner()
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        if not db.execute("SELECT 1 FROM customers WHERE dataset='meridian' AND id=?",(customer_id,)).fetchone():raise ValueError('Select an existing customer.')
        existing=db.execute("SELECT * FROM kyc_cases WHERE customer_id=? AND owner=? AND source_draft_id IS NULL AND status!='Closed without verification' ORDER BY created_at DESC LIMIT 1",(customer_id,identity)).fetchone()
        if existing:return payload(db,existing)
        case_id=identifier('KYC');db.execute('INSERT INTO kyc_cases VALUES(?,?,?,?,?,?,?,?)',(case_id,customer_id,None,identity,'Manual review','Needs information',1,now()))
        db.execute('INSERT INTO kyc_events VALUES(?,?,?,?,?,?,?)',(identifier('KYC-EVENT'),case_id,'Review opened',customer_id,body.reason,actor().actor_id,now()))
        return payload(db,db.execute('SELECT * FROM kyc_cases WHERE id=?',(case_id,)).fetchone())

class Review(BaseModel):
    model_config=ConfigDict(extra='forbid')
    revision:int=Field(ge=1)
    status:Literal['Needs information','Reviewed pending verification','Rejected','Closed without verification']
    kind:Literal['Reviewer note','Identity proof reference','Address proof reference']='Reviewer note'
    reference:str=Field(default='',max_length=120)
    note:str=Field(min_length=5,max_length=500)

@router.patch('/kyc/{case_id}')
def review_case(case_id:str,body:Review):
    require('customer_write')
    with connect() as db:row=db.execute('SELECT * FROM kyc_cases WHERE id=?',(case_id,)).fetchone()
    if not row:raise ValueError('KYC case not found.')
    permitted(row)
    if body.kind!='Reviewer note' and not body.reference.strip():raise ValueError('Supply an evidence reference. Do not claim verification from a reference alone.')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE');current=db.execute('SELECT * FROM kyc_cases WHERE id=?',(case_id,)).fetchone()
        if current['revision']!=body.revision:raise HTTPException(409,'KYC review changed. Reload the latest case.')
        if body.status=='Reviewed pending verification':
            kinds={event[0] for event in db.execute('SELECT kind FROM kyc_events WHERE case_id=?',(case_id,))}|{body.kind}
            if not {'Identity proof reference','Address proof reference'}<=kinds:raise ValueError('Record missing identity/address evidence references before marking reviewed. Verification remains pending.')
        db.execute('UPDATE kyc_cases SET status=?,revision=revision+1 WHERE id=?',(body.status,case_id))
        db.execute('INSERT INTO kyc_events VALUES(?,?,?,?,?,?,?)',(identifier('KYC-EVENT'),case_id,body.kind,body.reference,body.note,actor().actor_id,now()))
        return payload(db,db.execute('SELECT * FROM kyc_cases WHERE id=?',(case_id,)).fetchone())
