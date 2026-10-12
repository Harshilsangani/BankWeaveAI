"""Staff propose OCR customers; an administrator applies a reviewed snapshot atomically."""
import hashlib
import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StrictBool

from .analytics import identifier, now
from .database import connect
from .form_quality import quality
from .forms import CustomerFields, add_customer
from .security import actor, require
from .sessions import form_access, session_key

router = APIRouter()


def allowed(row):
    identity = actor()
    if row['tenant'] != identity.tenant:
        raise PermissionError('This request is not accessible in your bank workspace.')
    if identity.role != 'admin' and (row['requested_by'] != identity.actor_id or row['session_id'] != session_key.get()):
        raise PermissionError('This request belongs to another staff workspace.')


def request_row(db, request_id):
    row = db.execute('SELECT * FROM admin_approval_requests WHERE id=?', (request_id,)).fetchone()
    if not row:
        raise HTTPException(404, 'Approval request not found.')
    allowed(row)
    return row


def payload(db, row, detail=False):
    snapshot = json.loads(row['snapshot'])
    result = json.loads(row['result']) if row['result'] else None
    value = dict(id=row['id'], draftId=row['draft_id'], filename=snapshot['filename'],
                 customerName=snapshot['fields']['fullName'], requestedBy=row['requested_by'],
                 status=row['status'], revision=row['revision'], createdAt=row['created_at'],
                 decidedAt=row['decided_at'], decidedBy=row['decided_by'], decisionNote=row['decision_note'],
                 customerId=result['customerId'] if result else None, snapshotHash=row['snapshot_hash'])
    value['customerDeleted'] = bool(result and not db.execute('SELECT 1 FROM customer_profiles WHERE id=?',(result['customerId'],)).fetchone())
    if detail:
        value.update(snapshot=snapshot, currentQuality=quality(db,row['draft_id']),
                     events=[dict(event) for event in db.execute('SELECT * FROM admin_approval_events WHERE request_id=? ORDER BY created_at,id',(row['id'],))])
    return value


def for_draft(db, draft_id):
    row = db.execute('SELECT * FROM admin_approval_requests WHERE draft_id=?',(draft_id,)).fetchone()
    return payload(db,row) if row else None


def event(db, request_id, kind, note):
    identity = actor()
    db.execute('INSERT INTO admin_approval_events VALUES(?,?,?,?,?,?,?)',
               (identifier('APP-EVENT'),request_id,kind,identity.actor_id,identity.role,note,now()))


def submit_form(thread_id, draft_id, fields, review_revision=None, duplicate_decision=None, duplicate_reason=''):
    identity = require('form_submit')
    sid = session_key.get()
    if not sid:
        raise ValueError('Open a saved staff workspace before submitting an approval request.')
    form_access(draft_id)
    from .agents import graph
    state = graph.get_state({'configurable':{'thread_id':thread_id}})
    if state.values.get('draft',{}).get('id') != draft_id:
        raise ValueError('The form draft does not belong to this extraction workflow.')
    fields = CustomerFields.model_validate(fields).model_dump()
    if len(fields['fullName'].strip()) < 2 or not fields['dateOfBirth']:
        raise ValueError('Review the customer name and date of birth before submitting.')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        existing = db.execute('SELECT * FROM admin_approval_requests WHERE draft_id=?',(draft_id,)).fetchone()
        if existing:
            allowed(existing)
            current = db.execute('SELECT status FROM form_drafts WHERE id=?',(draft_id,)).fetchone()
            if current and current['status'] == 'deleted':
                raise ValueError('This customer profile was deleted. Upload a new application.')
            snapshot = json.loads(existing['snapshot'])
            if fields != snapshot['fields'] or (review_revision is not None and review_revision != existing['review_revision']) or duplicate_decision != snapshot['duplicateDecision'] or duplicate_reason.strip() != snapshot['duplicateReason']:
                raise HTTPException(409,'This form already has a submitted request. Reopen its recorded review.')
            return payload(db,existing)
        draft = db.execute('SELECT * FROM form_drafts WHERE id=?',(draft_id,)).fetchone()
        if not draft or draft['status'] != 'pending':
            raise ValueError('Only a pending extracted form can be submitted.')
        review = quality(db,draft_id)
        if fields != json.loads(draft['fields']) or (review_revision is not None and review_revision != review['revision']):
            raise HTTPException(409,'The form review changed. Save corrections and reload the latest review.')
        if review['possibleDuplicates']:
            if duplicate_decision not in ('reuse','create_separate') or len(duplicate_reason.strip()) < 5:
                raise ValueError('Review possible duplicates and record a proposed decision with a reason.')
        snapshot = dict(filename=draft['filename'], markdown=draft['markdown'], fields=fields,
                        provenance=review['provenance'], reviewRevision=review['revision'],
                        duplicateDecision=duplicate_decision, duplicateReason=duplicate_reason.strip())
        text = json.dumps(snapshot,sort_keys=True,ensure_ascii=False)
        request_id = identifier('APPROVAL')
        db.execute('INSERT INTO admin_approval_requests(id,tenant,requested_by,session_id,draft_id,thread_id,snapshot,snapshot_hash,review_revision,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                   (request_id,identity.tenant,identity.actor_id,sid,draft_id,thread_id,text,hashlib.sha256(text.encode()).hexdigest(),review['revision'],'pending',now()))
        db.execute("UPDATE form_drafts SET status='submitted' WHERE id=?",(draft_id,))
        event(db,request_id,'Submitted','Reviewed customer draft submitted for admin approval; no customer created.')
        return payload(db,request_row(db,request_id))


@router.get('/approvals')
def list_requests(status:Literal['all','pending','approved','rejected']='pending',offset:int=Query(default=0,ge=0,le=100000)):
    identity = require('read')
    where, args = 'tenant=?', [identity.tenant]
    if identity.role != 'admin':
        where += ' AND requested_by=? AND session_id=?'
        args += [identity.actor_id,session_key.get() or '']
    if status != 'all':
        where += ' AND status=?'; args.append(status)
    with connect() as db:
        total = db.execute(f'SELECT COUNT(*) FROM admin_approval_requests WHERE {where}',args).fetchone()[0]
        rows = db.execute(f'SELECT * FROM admin_approval_requests WHERE {where} ORDER BY created_at DESC,id LIMIT 20 OFFSET ?',[*args,offset]).fetchall()
        return dict(rows=[payload(db,row) for row in rows],total=total,offset=offset,nextOffset=offset+len(rows) if offset+len(rows)<total else None,canApprove=identity.role=='admin')


@router.get('/approvals/{request_id}')
def get_request(request_id:str):
    with connect() as db:
        return payload(db,request_row(db,request_id),True)


class Decision(BaseModel):
    model_config = ConfigDict(extra='forbid')
    decision:Literal['approve','reject']
    revision:int = Field(ge=1)
    confirmed:StrictBool
    note:str = Field(min_length=5,max_length=500)
    duplicateDecision:Literal['reuse','create_separate'] | None = None
    duplicateReason:str = Field(default='',max_length=500)


def finish_checkpoint(thread_id, result):
    # The application DB is canonical. A replay repairs a checkpoint if a process
    # stopped after committing the atomic decision/customer write.
    from .agents import graph
    try:
        graph.update_state({'configurable':{'thread_id':thread_id}},{'result':result},as_node='customer_update')
    except Exception:
        import logging
        logging.getLogger(__name__).warning('Approved customer checkpoint awaits repair; decision is persisted.')


@router.post('/approvals/{request_id}/decision')
def decide_request(request_id:str, body:Decision):
    identity = require('approval_review')
    if body.confirmed is not True or len(body.note.strip()) < 5:
        raise ValueError('Explicitly confirm the decision and provide a review note.')
    expected_status = 'approved' if body.decision == 'approve' else 'rejected'
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = request_row(db,request_id)
        if row['status'] != 'pending':
            if row['status'] != expected_status:
                raise HTTPException(409,'This request already has a different final decision.')
            value = payload(db,row,True)
            result = json.loads(row['result']) if row['result'] else None
        else:
            if body.revision != row['revision']:
                raise HTTPException(409,'The request changed. Reload its latest review.')
            snapshot = json.loads(row['snapshot'])
            if hashlib.sha256(row['snapshot'].encode()).hexdigest() != row['snapshot_hash']:
                raise HTTPException(409,'The submitted snapshot failed its integrity check. No customer was added.')
            draft = db.execute('SELECT * FROM form_drafts WHERE id=?',(row['draft_id'],)).fetchone()
            review = quality(db,row['draft_id'])
            if not draft or draft['status'] != 'submitted' or review['revision'] != row['review_revision'] or json.loads(draft['fields']) != snapshot['fields'] or draft['markdown'] != snapshot['markdown']:
                raise HTTPException(409,'The submitted form changed. No customer was added; reload the review.')
            result = None
            if body.decision == 'approve':
                result = add_customer(row['draft_id'],snapshot['fields'],body.duplicateDecision,body.duplicateReason,review['revision'],connection=db,approval_id=request_id)
            else:
                db.execute("UPDATE form_drafts SET status='rejected' WHERE id=?",(row['draft_id'],))
            db.execute('UPDATE admin_approval_requests SET status=?,revision=revision+1,decided_at=?,decided_by=?,decision_note=?,result=? WHERE id=?',
                       (expected_status,now(),identity.actor_id,body.note.strip(),json.dumps(result) if result else None,request_id))
            event(db,request_id,expected_status.title(),body.note.strip())
            value = payload(db,request_row(db,request_id),True)
    if result:
        finish_checkpoint(row['thread_id'],result)
    return value
