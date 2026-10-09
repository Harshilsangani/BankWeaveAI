"""Deterministic, recorded snapshot rules. No scheduling or live-feed claim."""
import hashlib,json
from fastapi import APIRouter
from pydantic import BaseModel,ConfigDict,Field
from typing import Literal
from .database import connect,metadata
from .analytics import build,risk,identifier,now,previous_period,validate_scope
from .security import require,actor
router=APIRouter()
RULES_VERSION='snapshot-rules-v1'
RULES={
 'RSK-001':dict(name='Flagged-count acceleration',minCount=25,minIncreasePct=20),
 'RSK-002':dict(name='Default-marker acceleration',minCount=30,minIncreasePct=10),
 'RSK-003':dict(name='Ahmedabad new-device concentration',minCount=20,minIncreasePct=0),
 'BS-001':dict(name='Public sample fraud labels',minCount=1,minIncreasePct=None),
}

def snapshot(db,dataset,period):
    # Streaming input hash: rows are folded into the digest in stable key
    # order as the cursor yields them, so a 10k-customer snapshot never
    # materializes the whole table set (or its JSON encoding) in memory.
    # Any inserted, deleted or modified source row changes the digest.
    periods=(period,previous_period(period))
    digest=hashlib.sha256()
    counts={}
    def stream(sql,args):
        # Serialize in bounded chunks: one C-speed encoding per chunk keeps
        # peak memory flat without paying per-row Python call overhead.
        total=0
        chunk=[]
        for row in db.execute(sql,args):
            chunk.append(tuple(row))
            total+=1
            if len(chunk)>=5000:
                digest.update(json.dumps(chunk,separators=(',',':')).encode())
                chunk=[]
        if chunk:
            digest.update(json.dumps(chunk,separators=(',',':')).encode())
        digest.update(b'\x00')
        return total
    current=baseline=0
    chunk=[]
    for row in db.execute('SELECT period,id,account_id,occurred_at,amount_minor,region,merchant,channel,device_id,new_device,flagged,score FROM transactions WHERE dataset=? AND period IN (?,?) ORDER BY id',(dataset,*periods)):
        chunk.append(tuple(row))
        if len(chunk)>=5000:
            digest.update(json.dumps(chunk,separators=(',',':')).encode())
            chunk=[]
        if row[0]==period:current+=1
        else:baseline+=1
    if chunk:
        digest.update(json.dumps(chunk,separators=(',',':')).encode())
    digest.update(b'\x00')
    counts['currentTransactions']=current
    counts['baselineTransactions']=baseline
    counts['loans']=stream('SELECT id,customer_id,branch_id,loan_type,principal_minor,default_months FROM loans WHERE dataset=? ORDER BY id',(dataset,))
    stream('SELECT id,region FROM customer_master WHERE dataset=? ORDER BY id',(dataset,))
    for table in ('customers','accounts','devices','fraud_alerts','loan_installments','loan_payments'):
        counts[table]=stream(f'SELECT * FROM {table} WHERE dataset=? ORDER BY id',(dataset,))
    digest.update(metadata(dataset)['version'].encode())
    return digest.hexdigest(),counts

def run(dataset='meridian',period=None):
    meta=metadata(dataset);period=period or meta['periods'][-1]
    validate_scope(dict(datasetId=dataset,period=period))
    # One transaction holds the snapshot while the rule outputs are computed.
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        digest,counts=snapshot(db,dataset,period)
        existing=db.execute('SELECT * FROM detector_runs WHERE dataset=? AND period=? AND rules_version=? AND input_hash=?',(dataset,period,RULES_VERSION,digest)).fetchone()
        if existing:return unpack(existing,True)
        scopes=[dict(datasetId=dataset,period=period,domain='fraud',riskId='BS-001' if dataset=='bankshield' else 'RSK-001')]
        if dataset=='meridian':scopes += [dict(datasetId=dataset,period=period,domain='loans',riskId='RSK-002'),dict(datasetId=dataset,period=period,domain='fraud',riskId='RSK-003',region='Ahmedabad',newDeviceOnly=True)]
        run_id=identifier('DETECT');created=now();events=[]
        for scope in scopes:
            data=build(scope);rule=RULES[scope['riskId']]
            count=data['current']['affected'];increase=data['delta']
            matched=count>=rule['minCount'] and (rule['minIncreasePct'] is None or increase is not None and increase>=rule['minIncreasePct'])
            if not matched:continue
            event=risk(scope,data)
            event.update(detection=dict(runId=run_id,rulesVersion=RULES_VERSION,inputHash=digest,sourceVersion=meta['version'],sourceCounts=counts,threshold=rule,currentCount=count,baselineCount=data['prior']['affected'],observedIncreasePct=increase,executedAt=created,scope=scope))
            event['evidence'].append(dict(id=run_id+':'+scope['riskId'],title='Recorded detection rule',source=RULES_VERSION,detail=rule['name']+' · '+json.dumps(rule),records=['Run: '+run_id,'Input SHA-256: '+digest,'Source counts: '+json.dumps(counts),f'Observed: {count} vs {data["prior"]["affected"]}']))
            events.append(event)
        db.execute('INSERT INTO detector_runs VALUES(?,?,?,?,?,?,?,?,?,?,?)',(run_id,dataset,period,RULES_VERSION,digest,meta['version'],json.dumps(counts),json.dumps(RULES),json.dumps(events),created,actor().actor_id))
        row=db.execute('SELECT * FROM detector_runs WHERE id=?',(run_id,)).fetchone()
        return unpack(row,False)

def unpack(row,replayed):
    return dict(id=row['id'],datasetId=row['dataset'],period=row['period'],rulesVersion=row['rules_version'],inputHash=row['input_hash'],sourceVersion=row['source_version'],sourceCounts=json.loads(row['source_counts']),thresholds=json.loads(row['thresholds']),events=json.loads(row['events']),createdAt=row['created_at'],replayed=replayed)

class RunInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    datasetId:Literal['meridian','bankshield']='meridian'
    period:str|None=Field(default=None,pattern=r'^20\d{2}-(0[1-9]|1[0-2])$')

@router.post('/detectors/run')
def manual_run(body:RunInput):
    require('analyze');return run(body.datasetId,body.period)

@router.get('/detectors/latest')
def latest_run(datasetId:Literal['meridian','bankshield']='meridian',period:str|None=None):
    return run(datasetId,period)
