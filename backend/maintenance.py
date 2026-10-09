"""Typed local record observations; no arbitrary SQL or real banking controls."""
import hashlib,json
from datetime import date
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,ConfigDict,Field,StrictBool,model_validator
from .database import connect
from .analytics import identifier,now
from .security import require,actor
from .operations import owner
router=APIRouter(prefix='/maintenance')

class Confirmed(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    requestId:str=Field(pattern=r'^[a-zA-Z0-9-]{16,80}$')
    confirmed:Literal[True]
    reason:str=Field(min_length=5,max_length=500)

class AccountInput(Confirmed):pass

class PolicyInput(Confirmed):
    product:Literal['Health cover','Term life']
    cover:Decimal=Field(gt=0,le=1000000000,decimal_places=2)
    annualPremium:Decimal=Field(gt=0,le=10000000,decimal_places=2)
    startOn:date
    endOn:date
    nomineeComplete:StrictBool
    @model_validator(mode='after')
    def dates(self):
        if self.endOn<=self.startOn:raise ValueError('Policy end date must follow its start date.')
        return self

class PolicyUpdate(Confirmed):
    revision:int=Field(ge=1)
    status:Literal['active','cancelled']
    nomineeComplete:StrictBool

class PaymentInput(Confirmed):
    installmentId:str=Field(pattern=r'^[a-zA-Z0-9-]{1,100}$')
    amount:Decimal=Field(gt=0,le=1000000000,decimal_places=2)
    paidOn:date

class ReverseInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    operationId:str=Field(pattern=r'^MAINT-[a-zA-Z0-9]+$')
    confirmed:Literal[True]
    reason:str=Field(min_length=5,max_length=500)

def customer(db,customer_id):
    if not db.execute("SELECT 1 FROM customers WHERE dataset='meridian' AND id=?",(customer_id,)).fetchone():raise ValueError('Select an existing Meridian customer.')

def encode(record):return json.dumps(record,sort_keys=True) if record is not None else None

def transact(customer_id,kind,body,work):
    require('customer_write');identity=owner();fingerprint=hashlib.sha256(json.dumps(dict(customer=customer_id,kind=kind,body=body.model_dump(mode='json')),sort_keys=True).encode()).hexdigest()
    with connect() as db:
        db.execute('BEGIN IMMEDIATE');customer(db,customer_id)
        previous=db.execute('SELECT * FROM maintenance_operations WHERE owner=? AND request_id=?',(identity,body.requestId)).fetchone()
        if previous:
            if previous['fingerprint']!=fingerprint:raise HTTPException(409,'Request ID belongs to different record inputs.')
            return {**json.loads(previous['receipt']),'replayed':True,'status':previous['status']}
        entity,before,after=work(db)
        operation_id=identifier('MAINT');receipt=dict(operationId=operation_id,entityId=entity,kind=kind,status='applied',replayed=False)
        db.execute('INSERT INTO maintenance_operations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(operation_id,identity,body.requestId,customer_id,fingerprint,kind,entity,encode(before),encode(after),'applied',json.dumps(receipt),now()))
        db.execute('INSERT INTO maintenance_events VALUES(?,?,?,?,?,?,?,?)',(identifier('MAINT-EVENT'),operation_id,'Applied',actor().actor_id,body.reason,encode(before),encode(after),now()))
    return receipt

@router.post('/{customer_id}/accounts')
def record_account(customer_id:str,body:AccountInput):
    def work(db):
        entity=identifier('ACC-M')
        db.execute('INSERT INTO accounts VALUES(?,?,?,?)',('meridian',entity,customer_id,date.today().isoformat()))
        return entity,None,dict(db.execute("SELECT * FROM accounts WHERE dataset='meridian' AND id=?",(entity,)).fetchone())
    return transact(customer_id,'account_record',body,work)

@router.post('/{customer_id}/policies')
def record_policy(customer_id:str,body:PolicyInput):
    def work(db):
        entity=identifier('INS-M')
        db.execute('INSERT INTO insurance_policies VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',('meridian',entity,customer_id,body.product,int(body.cover*100),int(body.annualPremium*100),body.startOn.isoformat(),body.endOn.isoformat(),'active',int(body.nomineeComplete),'Manual synthetic policy observation',1))
        return entity,None,dict(db.execute("SELECT * FROM insurance_policies WHERE dataset='meridian' AND id=?",(entity,)).fetchone())
    return transact(customer_id,'policy_record',body,work)

@router.patch('/{customer_id}/policies/{policy_id}')
def update_policy(customer_id:str,policy_id:str,body:PolicyUpdate):
    def work(db):
        row=db.execute("SELECT * FROM insurance_policies WHERE dataset='meridian' AND id=? AND customer_id=?",(policy_id,customer_id)).fetchone()
        if not row:raise ValueError('Policy does not belong to this customer.')
        if row['revision']!=body.revision:raise HTTPException(409,'Policy changed. Reload before editing.')
        before=dict(row)
        db.execute("UPDATE insurance_policies SET status=?,nominee_complete=?,revision=revision+1 WHERE dataset='meridian' AND id=?",(body.status,int(body.nomineeComplete),policy_id))
        return policy_id,before,dict(db.execute("SELECT * FROM insurance_policies WHERE dataset='meridian' AND id=?",(policy_id,)).fetchone())
    return transact(customer_id,'policy_update',body,work)

@router.post('/{customer_id}/payments')
def record_payment(customer_id:str,body:PaymentInput):
    def work(db):
        row=db.execute("SELECT i.* FROM loan_installments i JOIN loans l ON l.dataset=i.dataset AND l.id=i.loan_id WHERE i.dataset='meridian' AND i.id=? AND l.customer_id=?",(body.installmentId,customer_id)).fetchone()
        if not row:raise ValueError('Installment does not belong to this customer.')
        if body.paidOn.isoformat()<row['due_on'] or body.paidOn>date.today():raise ValueError('Record a payment date from the due date through today.')
        paid=db.execute("SELECT COALESCE(SUM(principal_paid_minor),0) FROM loan_payments WHERE dataset='meridian' AND installment_id=?",(row['id'],)).fetchone()[0]
        amount=int(body.amount*100)
        if amount>row['principal_due_minor']-paid:raise ValueError('Payment exceeds remaining due principal. Interest/fees are outside this ledger.')
        entity=identifier('PAY-M')
        db.execute('INSERT INTO loan_payments VALUES(?,?,?,?,?,?)',('meridian',entity,row['id'],body.paidOn.isoformat(),amount,'Explicit manual synthetic payment observation'))
        return entity,None,dict(db.execute("SELECT * FROM loan_payments WHERE dataset='meridian' AND id=?",(entity,)).fetchone())
    return transact(customer_id,'principal_payment',body,work)

def same_content(left,right):return {k:v for k,v in left.items() if k!='revision'}=={k:v for k,v in right.items() if k!='revision'}

@router.post('/{customer_id}/reverse')
def reverse(customer_id:str,body:ReverseInput):
    require('customer_write');identity=owner()
    with connect() as db:
        db.execute('BEGIN IMMEDIATE');customer(db,customer_id)
        operation=db.execute('SELECT rowid sequence,* FROM maintenance_operations WHERE id=? AND customer_id=? AND owner=?',(body.operationId,customer_id,identity)).fetchone()
        if not operation:raise PermissionError('Operation belongs to another staff workspace/customer.')
        if operation['status']=='reversed':return dict(operationId=operation['id'],status='reversed',replayed=True)
        later=db.execute("SELECT 1 FROM maintenance_operations WHERE entity_id=? AND status='applied' AND rowid>?",(operation['entity_id'],operation['sequence'])).fetchone()
        if later:raise HTTPException(409,'Reverse the most recent operation on this record first.')
        table={'account_record':'accounts','policy_record':'insurance_policies','policy_update':'insurance_policies','principal_payment':'loan_payments'}[operation['kind']]
        row=db.execute(f"SELECT * FROM {table} WHERE dataset='meridian' AND id=?",(operation['entity_id'],)).fetchone()
        if not row or not same_content(dict(row),json.loads(operation['after_record'])):raise HTTPException(409,'The record changed outside this operation. Review before reversal.')
        if table=='accounts' and db.execute("SELECT 1 FROM transactions WHERE dataset='meridian' AND account_id=?",(row['id'],)).fetchone():raise ValueError('Account has transactions. Reversal cannot orphan source records.')
        before=json.loads(operation['before_record']) if operation['before_record'] else None
        if before is None:db.execute(f"DELETE FROM {table} WHERE dataset='meridian' AND id=?",(row['id'],))
        else:
            db.execute("UPDATE insurance_policies SET status=?,nominee_complete=?,revision=revision+1 WHERE dataset='meridian' AND id=?",(before['status'],before['nominee_complete'],row['id']))
        db.execute("UPDATE maintenance_operations SET status='reversed' WHERE id=?",(operation['id'],))
        db.execute('INSERT INTO maintenance_events VALUES(?,?,?,?,?,?,?,?)',(identifier('MAINT-EVENT'),operation['id'],'Reversed',actor().actor_id,body.reason,encode(dict(row)),encode(before),now()))
    return dict(operationId=body.operationId,status='reversed',replayed=False)

@router.get('/{customer_id}')
def history(customer_id:str):
    identity=owner()
    with connect() as db:
        customer(db,customer_id)
        policies=[dict(row) for row in db.execute("SELECT * FROM insurance_policies WHERE dataset='meridian' AND customer_id=? ORDER BY id",(customer_id,))]
        installments=[dict(row) for row in db.execute('''SELECT i.id,i.loan_id,i.due_on,i.principal_due_minor-COALESCE(SUM(p.principal_paid_minor),0) remaining_minor FROM loan_installments i JOIN loans l ON l.dataset=i.dataset AND l.id=i.loan_id LEFT JOIN loan_payments p ON p.dataset=i.dataset AND p.installment_id=i.id WHERE i.dataset='meridian' AND l.customer_id=? GROUP BY i.id HAVING remaining_minor>0 ORDER BY i.due_on DESC LIMIT 30''',(customer_id,))]
        operations=[]
        for row in db.execute('SELECT * FROM maintenance_operations WHERE owner=? AND customer_id=? ORDER BY rowid DESC LIMIT 30',(identity,customer_id)):
            operations.append(dict(id=row['id'],kind=row['kind'],entityId=row['entity_id'],status=row['status'],createdAt=row['created_at'],events=[dict(event) for event in db.execute('SELECT action,actor,reason,created_at FROM maintenance_events WHERE operation_id=? ORDER BY rowid',(row['id'],))]))
    return dict(customerId=customer_id,policies=policies,installments=installments,operations=operations,limitations=['These workflows record synthetic application observations. No real account is opened, insurance enrolled or payment executed.','Account reversal is rejected when source transactions reference it. Policy revisions and payment limits are validated. Reverse later operations before earlier ones.','Reversal preserves immutable history and requires the same staff workspace with operator permission.'])
