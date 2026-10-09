import json
from typing import Literal
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,ConfigDict,Field
from .database import connect,metadata
from .security import actor,require
from .sessions import artifact_access,session_key
from .analytics import identifier,now,validate_scope

router=APIRouter()


def canonical(db,inv_id):
    row=db.execute("SELECT payload FROM artifacts WHERE id=? AND kind='investigation'",(inv_id,)).fetchone()
    if not row: raise HTTPException(404,'Investigation not found.')
    return json.loads(row[0])


def ensure_case(db,inv):
    result=db.execute('INSERT OR IGNORE INTO investigation_cases VALUES(?,?,?,?)',(inv['id'],actor().actor_id,'In review',1))
    if result.rowcount:
        event(db,inv,'opened','Investigation ready for human review.')


def event(db,inv,kind,note):
    db.execute('INSERT INTO case_events VALUES(?,?,?,?,?,?,?)',(identifier('CASE-EV'),inv['id'],actor().actor_id,kind,note,json.dumps(inv['scope']),now()))


@router.get('/cases/{inv_id}')
def get_case(inv_id:str):
    artifact_access(inv_id)
    with connect() as db:
        inv=canonical(db,inv_id); ensure_case(db,inv)
        case=dict(db.execute('SELECT * FROM investigation_cases WHERE investigation_id=?',(inv_id,)).fetchone())
        events=[dict(r) for r in db.execute('SELECT * FROM case_events WHERE investigation_id=? ORDER BY created_at,id',(inv_id,))]
    return {**case,'events':events,'scope':inv['scope']}


class CaseUpdate(BaseModel):
    model_config=ConfigDict(extra='forbid')
    revision:int=Field(ge=1)
    status:Literal['In review','Monitoring','Resolved'] | None=None
    owner:Literal['local-analyst','local-customer_operator'] | None=None
    kind:Literal['note','action']='note'
    note:str=Field(default='',max_length=2000)


@router.patch('/cases/{inv_id}')
def update_case(inv_id:str,body:CaseUpdate):
    require('analyze'); artifact_access(inv_id)
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        inv=canonical(db,inv_id); ensure_case(db,inv)
        case=db.execute('SELECT * FROM investigation_cases WHERE investigation_id=?',(inv_id,)).fetchone()
        if case['revision']!=body.revision: raise HTTPException(409,'The case changed. Reload before saving.')
        if body.owner and body.owner!=case['owner']:
            event(db,inv,'assignment',f'Assigned to {body.owner}.')
        if body.status and body.status!=case['status']:
            event(db,inv,'status',f"{case['status']} → {body.status}")
        if body.note.strip(): event(db,inv,body.kind,body.note.strip())
        if not body.note.strip() and not body.status and not body.owner: raise ValueError('Add a note, action or case change.')
        db.execute('UPDATE investigation_cases SET owner=?,status=?,revision=revision+1 WHERE investigation_id=?',(body.owner or case['owner'],body.status or case['status'],inv_id))
    return get_case(inv_id)


def workspace():
    sid=session_key.get()
    if sid:
        from .sessions import ensure
        with connect() as db: ensure(db,sid)
    return sid or 'local-tools:'+actor().actor_id


@router.get('/risk-state')
def risk_state(datasetId:Literal['meridian','bankshield']='meridian',period:str|None=None):
    period=period or metadata(datasetId)['periods'][-1]
    validate_scope(dict(datasetId=datasetId,period=period))
    workspace_id=workspace()
    with connect() as db:
        rows=db.execute('SELECT risk_id FROM risk_dispositions WHERE workspace=? AND dataset=? AND period=? AND dismissed=1',(workspace_id,datasetId,period)).fetchall()
    return dict(dismissed=[r['risk_id'] for r in rows])


class RiskDisposition(BaseModel):
    model_config=ConfigDict(extra='forbid')
    datasetId:Literal['meridian','bankshield']='meridian'
    period:str|None=None
    riskId:Literal['RSK-001','RSK-002','RSK-003','BS-001']|None=None
    action:Literal['dismiss','restore']


@router.patch('/risk-state')
def set_risk_state(body:RiskDisposition):
    require('analyze')
    period=body.period or metadata(body.datasetId)['periods'][-1]
    validate_scope(dict(datasetId=body.datasetId,period=period,riskId=body.riskId))
    workspace_id=workspace()
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        targets=[body.riskId] if body.riskId else [r[0] for r in db.execute('SELECT risk_id FROM risk_dispositions WHERE workspace=? AND dataset=? AND period=? AND dismissed=1',(workspace_id,body.datasetId,period))]
        if body.action=='dismiss' and not body.riskId: raise ValueError('Select a signal to dismiss.')
        for risk_id in targets:
            current=db.execute('SELECT dismissed FROM risk_dispositions WHERE workspace=? AND dataset=? AND period=? AND risk_id=?',(workspace_id,body.datasetId,period,risk_id)).fetchone()
            dismissed=1 if body.action=='dismiss' else 0
            if current and current[0]==dismissed: continue
            db.execute('INSERT OR REPLACE INTO risk_dispositions VALUES(?,?,?,?,?,?,?)',(workspace_id,body.datasetId,period,risk_id,dismissed,actor().actor_id,now()))
            db.execute('INSERT INTO audit_runs VALUES(?,?,?,?,?,?)',(identifier('RUN'),'risk_'+body.action,json.dumps(dict(datasetId=body.datasetId,period=period,riskId=risk_id,actor=actor().actor_id,workspace=workspace_id)),'Explicit staff disposition',now(),''))
    return risk_state(body.datasetId,period)


@router.get('/saved-investigations/{inv_id}')
def saved_investigation(inv_id:str):
    artifact_access(inv_id)
    with connect() as db:
        inv=canonical(db,inv_id)
        sid=session_key.get()
        if sid:
            from .sessions import ensure
            state=ensure(db,sid); state['investigationId']=inv_id
            db.execute('UPDATE workspace_sessions SET state=? WHERE id=?',(json.dumps(state),sid))
        return inv
