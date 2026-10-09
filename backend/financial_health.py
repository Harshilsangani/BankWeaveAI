"""Labelled synthetic flows, separated from verified income or affordability."""
import calendar,hashlib,json
from fastapi import APIRouter
from .database import connect
from .analytics import resolve,analysis_metadata,identifier,now,sanitize,currency
router=APIRouter();VERSION='synthetic-cashflow-v1'

def seed():
    with connect() as db:
        # One fixture account per customer; manual demo accounts must not generate
        # another salary history when an operator explicitly reruns the seed.
        accounts=db.execute("SELECT a.* FROM accounts a JOIN customer_master m ON m.dataset=a.dataset AND m.id=a.customer_id WHERE a.dataset='meridian' AND a.id=(SELECT MIN(f.id) FROM accounts f WHERE f.dataset=a.dataset AND f.customer_id=a.customer_id) ORDER BY a.id").fetchall()
        for index,account in enumerate(accounts):
            income=(50000+index%31*1000)*100
            db.execute('INSERT OR IGNORE INTO cashflow_opening_balances VALUES(?,?,?,?,?)',('meridian',account['customer_id'],'2026-04-01',5000000,'Generated opening balance, not observed account balance'))
            for month in range(4,10):
                db.execute('INSERT OR IGNORE INTO cashflow_events VALUES(?,?,?,?,?,?,?,?,?,?)',('meridian',account['id']+f'-INCOME-{month:02}',account['customer_id'],account['id'],f'2026-{month:02}-01','inflow','Synthetic payroll',income,None,'Generated synthetic income, not inferred or verified salary'))
        db.execute('''INSERT OR IGNORE INTO cashflow_events SELECT t.dataset,'FLOW-'||t.id,a.customer_id,t.account_id,substr(t.occurred_at,1,10),'outflow',t.merchant,t.amount_minor,t.id,'Synthetic outflow classification of fixture transaction; original source has no verified debit/credit direction'
          FROM transactions t JOIN accounts a ON a.dataset=t.dataset AND a.id=t.account_id JOIN customer_master m ON m.dataset=a.dataset AND m.id=a.customer_id WHERE t.dataset='meridian' ''')

def overview(scope):
    scope=resolve('',scope)
    if scope['datasetId']!='meridian':raise ValueError('BankShield lacks coherent customer cashflow observations.')
    if scope.get('minAmount') is not None or scope.get('newDeviceOnly'):raise ValueError('Financial health supports customer, region and month filters. Clear transaction amount/device filters.')
    year,month=map(int,scope['period'].split('-'));as_of=f'{year}-{month:02}-{calendar.monthrange(year,month)[1]:02}'
    where="c.dataset='meridian'";args=[]
    if scope.get('customerId'):where+=' AND c.id=?';args.append(scope['customerId'])
    if scope.get('region'):where+=' AND m.region IN (?,?)';args.extend([scope['region'],scope.get('comparison') or scope['region']])
    with connect() as db:
        rows=[dict(row) for row in db.execute(f'SELECT f.* FROM cashflow_events f JOIN customers c ON c.dataset=f.dataset AND c.id=f.customer_id LEFT JOIN customer_master m ON m.dataset=c.dataset AND m.id=c.id WHERE {where} AND f.occurred_on<=? ORDER BY f.occurred_on,f.id',[*args,as_of])]
        opening=db.execute(f'SELECT COALESCE(SUM(b.amount_minor),0) FROM cashflow_opening_balances b JOIN customers c ON c.dataset=b.dataset AND c.id=b.customer_id LEFT JOIN customer_master m ON m.dataset=c.dataset AND m.id=c.id WHERE {where} AND b.as_of<=?',[*args,as_of]).fetchone()[0]
        # Principal payments are distinct observed obligations; never counted as interest or fees.
        payments=[dict(row) for row in db.execute(f'''SELECT p.id,p.paid_on,p.principal_paid_minor,l.customer_id FROM loan_payments p JOIN loan_installments i ON i.dataset=p.dataset AND i.id=p.installment_id JOIN loans l ON l.dataset=i.dataset AND l.id=i.loan_id JOIN customers c ON c.dataset=l.dataset AND c.id=l.customer_id LEFT JOIN customer_master m ON m.dataset=c.dataset AND m.id=c.id WHERE {where} AND p.paid_on<=? ORDER BY p.paid_on,p.id''',[*args,as_of])]
        due=db.execute(f'''SELECT COALESCE(SUM(i.principal_due_minor),0) FROM loan_installments i JOIN loans l ON l.dataset=i.dataset AND l.id=i.loan_id JOIN customers c ON c.dataset=l.dataset AND c.id=l.customer_id LEFT JOIN customer_master m ON m.dataset=c.dataset AND m.id=c.id WHERE {where} AND substr(i.due_on,1,7)=?''',[*args,scope['period']]).fetchone()[0]
    current=[row for row in rows if row['occurred_on'][:7]==scope['period']]
    income=sum(row['amount_minor'] for row in current if row['direction']=='inflow');spend=sum(row['amount_minor'] for row in current if row['direction']=='outflow');paid=sum(row['principal_paid_minor'] for row in payments if row['paid_on'][:7]==scope['period'])
    balance=opening+sum(row['amount_minor']*(1 if row['direction']=='inflow' else -1) for row in rows)-sum(row['principal_paid_minor'] for row in payments)
    categories={}
    for row in current:
        if row['direction']=='outflow':categories[row['category']]=categories.get(row['category'],0)+row['amount_minor']/100
    trend=[]
    for p in sorted({row['occurred_on'][:7] for row in rows}):
        value=sum(row['amount_minor']*(1 if row['direction']=='inflow' else -1) for row in rows if row['occurred_on'][:7]==p)-sum(row['principal_paid_minor'] for row in payments if row['paid_on'][:7]==p)
        trend.append(dict(name=calendar.month_abbr[int(p[-2:])],value=value/100))
    digest=hashlib.sha256(json.dumps(dict(rows=rows,payments=payments,opening=opening,due=due,asOf=as_of),sort_keys=True).encode()).hexdigest()
    return dict(scope=scope,asOf=as_of,version=VERSION,snapshotHash=digest,hasObservations=bool(rows),income=income/100,spending=spend/100,paidPrincipal=paid/100,duePrincipal=due/100,netFlow=(income-spend-paid)/100,recordedBalance=balance/100,netFlowRate=(income-spend-paid)/income*100 if income else None,trend=trend,categories=[dict(name=key,value=value) for key,value in sorted(categories.items())],rows=current[:20],limitations=['Income and opening balances are explicitly generated demo observations, not verified salary or account balances.','Original fixture transactions have no verified debit/credit direction. Their outgoing classification is synthetic and labelled; this is not inference from a real bank statement.','Principal loan payments are subtracted separately. Other accounts, interest, fees, taxes, insurance payment history and outside obligations are unavailable. Net-flow rate is descriptive, not a financial-health score or affordability decision.'])

@router.get('/financial-health/{customer_id}')
def customer_health(customer_id:str):return overview(dict(datasetId='meridian',domain='fraud',customerId=customer_id))

def answer(query,scope):
    data=overview(scope)
    from .progress import emit
    emit('Synthetic cashflow and obligations reconciled')
    blocks=[dict(type='TEXT',text=f"Synthetic cashflow as of {data['asOf']}: incoming {currency(data['income'],'INR')}, outgoing {currency(data['spending'],'INR')}, principal payments {currency(data['paidPrincipal'],'INR')}. No verified salary or affordability conclusion is available." if data['hasObservations'] else 'No cashflow observations are supplied for this customer/scope. Missing data does not indicate good or poor financial health.')]
    if data['hasObservations']:
        blocks += [dict(type='KPI',metrics=[dict(label=label,value=currency(value,'INR'),change='Synthetic observations',direction='neutral',detail='As of '+data['asOf']) for label,value in [('Incoming',data['income']),('Net flow',data['netFlow']),('Recorded balance',data['recordedBalance'])]]),dict(type='CHART',title='Synthetic net cashflow',subtitle='INR · after recorded principal payments',kind='bar',points=data['trend']),dict(type='TABLE',title='Spending categories',data=dict(columns=['Category','Synthetic outgoing value'],rows=[[row['name'],currency(row['value'],'INR')] for row in data['categories']]))]
    blocks.append(dict(type='EVIDENCE',evidence=[dict(id=VERSION+':'+data['snapshotHash'][:12],title='Cashflow observations & limits',source=VERSION,detail='Synthetic incoming/outgoing classifications with linked account/customer IDs.',records=data['limitations']+[row['id']+' · '+row['source'] for row in data['rows'][:5]])]))
    response=dict(id=identifier('MSG'),question=sanitize(query),context=data['scope'],timestamp=now(),title='Customer cashflow & obligations',blocks=blocks,suggestions=['Show financial health in Ahmedabad','Show loan repayments and overdue evidence'])
    response['analysis']=analysis_metadata(data['scope'],response['id']);response['analysis']['datasetVersion']=data['snapshotHash'];response['analysis']['limitations']+=data['limitations'];return response
