"""Explicit synthetic principal-only ledger; no interest/collection decision."""
import calendar,json,hashlib
from datetime import date
from fastapi import APIRouter
from .database import connect, metadata
from .analytics import resolve,analysis_metadata,identifier,now,currency,sanitize
from .loans import condition,JOINS,REGION
router=APIRouter()
VERSION='synthetic-principal-ledger-v1'

def seed():
    with connect() as db:
        loans=db.execute("SELECT * FROM loans l WHERE dataset='meridian' AND NOT EXISTS(SELECT 1 FROM record_import_sources r WHERE r.dataset=l.dataset AND r.entity='loans' AND r.record_id=l.id)").fetchall()
        for loan in loans:
            defaults=json.loads(loan['default_months']);amount=max(1,loan['principal_minor']//48)
            for month in range(4,10):
                installment=f'{loan["id"]}-I{month:02}'
                due=f'2026-{month:02}-15'
                db.execute('INSERT OR IGNORE INTO loan_installments VALUES(?,?,?,?,?,?)',('meridian',installment,loan['id'],due,amount,VERSION))
                missed=calendar.month_abbr[month] in defaults
                paid=f'2026-{month+1:02}-25' if missed and month<9 else None if missed else due
                if paid:db.execute('INSERT OR IGNORE INTO loan_payments VALUES(?,?,?,?,?,?)',('meridian',installment+'-P',installment,paid,amount,'Generated synthetic principal payment'))

def ledger(scope):
    scope=resolve('',{**scope,'domain':'loans'})
    if scope['datasetId']!='meridian':raise ValueError('BankShield has no repayment observations.')
    snapshot_period = metadata(scope['datasetId'])['periods'][-1] if scope['period'] == 'all' else scope['period']
    year,month=map(int,snapshot_period.split('-'));as_of=date(year,month,calendar.monthrange(year,month)[1]).isoformat()
    sql,args=condition(scope)
    with connect() as db:
        rows=db.execute(f'''SELECT i.id,i.loan_id,l.customer_id,{REGION} region,i.due_on,i.principal_due_minor,
            COALESCE(SUM(CASE WHEN p.paid_on<=? THEN p.principal_paid_minor ELSE 0 END),0) paid_minor,
            MAX(CASE WHEN p.paid_on<=? THEN p.paid_on END) paid_on
            FROM loan_installments i JOIN loans l ON l.dataset=i.dataset AND l.id=i.loan_id
            {JOINS}
            LEFT JOIN loan_payments p ON p.dataset=i.dataset AND p.installment_id=i.id
            WHERE {sql} AND i.due_on<=? GROUP BY i.dataset,i.id ORDER BY i.due_on DESC,i.id''',[as_of,as_of,*args,as_of]).fetchall()
        principal=db.execute(f'SELECT COALESCE(SUM(l.principal_minor),0) FROM loans l {JOINS} WHERE {sql}',args).fetchone()[0]
        missing=db.execute(f'SELECT COUNT(*) FROM loans l {JOINS} WHERE {sql} AND NOT EXISTS(SELECT 1 FROM loan_installments i WHERE i.dataset=l.dataset AND i.loan_id=l.id AND i.due_on<=?)',[*args,as_of]).fetchone()[0]
    records=[]
    for row in rows:
        item=dict(row);item['overdueMinor']=max(0,item['principal_due_minor']-item['paid_minor']);item['daysOverdue']=(date.fromisoformat(as_of)-date.fromisoformat(item['due_on'])).days if item['overdueMinor'] else 0;item['status']='Overdue' if item['overdueMinor'] else 'Paid';records.append(item)
    paid=sum(row['paid_minor'] for row in records);overdue=sum(row['overdueMinor'] for row in records)
    delinquent={row['loan_id'] for row in records if row['overdueMinor']}
    digest=hashlib.sha256(json.dumps(dict(records=records,principal=principal,asOf=as_of),sort_keys=True).encode()).hexdigest()
    result=dict(scope=scope,asOf=as_of,version=VERSION,snapshotHash=digest,installments=len(records),paidPrincipal=paid/100,overduePrincipal=overdue/100,outstandingPrincipal=max(0,principal-paid)/100,delinquentLoans=len(delinquent),maxDaysOverdue=max((row['daysOverdue'] for row in records),default=0),rows=sorted(records,key=lambda row:(-row['daysOverdue'],row['loan_id'],row['id']))[:30],loansWithoutObservations=missing,limitations=['Generated demonstration ledger linked to the existing loans. Dates/payments are synthetic observations, not bank-confirmed records.','48 equal principal installments are assumed for seeded fixture loans only; imported loans receive no generated schedule/payments. Interest, fees, restructures and earlier payments are unavailable.','Outstanding principal is original principal minus recorded synthetic principal payments. It is not a verified account balance or a lending/collection decision.'])
    if missing: result['limitations'].append(f'{missing} loans have no repayment observations as of this date. Zero observed overdue records does not establish that these loans are current; the principal balance proxy is incomplete.')
    return result

@router.get('/repayments/{customer_id}')
def customer_ledger(customer_id:str):return ledger(dict(datasetId='meridian',domain='loans',customerId=customer_id))

def answer(query,scope):
    data=ledger(scope);scope=data['scope']
    from .progress import emit
    emit('Dated repayment records reconciled')
    metrics=[dict(label=label,value=value,change='Synthetic ledger',direction='neutral',detail='As of '+data['asOf']) for label,value in [('Delinquent loans',str(data['delinquentLoans'])),('Overdue principal',currency(data['overduePrincipal'],'INR')),('Recorded principal balance',currency(data['outstandingPrincipal'],'INR'))]]
    rows=[[r['id'],r['loan_id'],r['customer_id'],r['due_on'],currency(r['overdueMinor']/100,'INR'),r['daysOverdue'],r['status']] for r in data['rows']]
    response=dict(id=identifier('MSG'),question=sanitize(query),context=scope,timestamp=now(),title='Repayment evidence & delinquency',blocks=[dict(type='TEXT',text=f"As of {data['asOf']}, {data['delinquentLoans']} loans have unpaid due principal. Maximum overdue age: {data['maxDaysOverdue']} days. This synthetic ledger is separate from the monthly default markers."),dict(type='KPI',metrics=metrics),dict(type='TABLE',title='Dated installment evidence · first 30',data=dict(columns=['Installment','Loan','Customer','Due date','Overdue principal','Days overdue','Status'],rows=rows)),dict(type='EVIDENCE',evidence=[dict(id=data['version']+':'+data['asOf'],title='Repayment ledger methodology',source=VERSION,detail='Principal-only synthetic schedule and recorded payments, evaluated at the selected month end.',records=data['limitations'])])],suggestions=['Compare loan default rates by branch','Show loan repayment overdue in Ahmedabad'])
    response['analysis']=analysis_metadata(scope,response['id']);response['analysis']['datasetVersion']=data['snapshotHash'];response['analysis']['limitations']+=data['limitations'];return response
