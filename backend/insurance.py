"""Recorded synthetic coverage, independent of suitability or claims decisions."""
import calendar,hashlib,json
from datetime import date,timedelta
from fastapi import APIRouter
from .database import connect, metadata
from .analytics import resolve,analysis_metadata,sanitize,identifier,now,currency
router=APIRouter()
VERSION='synthetic-insurance-v1'

def seed():
    with connect() as db:
        customers=db.execute("SELECT id FROM customer_master WHERE dataset='meridian' ORDER BY id").fetchall()
        for index,customer in enumerate(customers):
            if index%3==0:continue
            product='Health cover' if index%2 else 'Term life'
            end='2026-09-15' if index%9==1 else '2026-10-15' if index%5==0 else '2027-03-31'
            db.execute('INSERT OR IGNORE INTO insurance_policies VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',('meridian','INS-'+customer['id'],customer['id'],product,(500000 if index%2 else 2000000)*100,(12000 if index%2 else 18000)*100,'2025-10-01',end,'active',int(index%7!=0),VERSION,1))

def overview(scope):
    scope=resolve('',scope)
    if scope.get('minAmount') is not None or scope.get('newDeviceOnly'):
        raise ValueError('Insurance supports customer, region and month filters. Clear transaction/loan amount and device filters first.')
    if scope['datasetId']!='meridian':raise ValueError('BankShield supplies no insurance policy observations.')
    snapshot_period = metadata(scope['datasetId'])['periods'][-1] if scope['period'] == 'all' else scope['period']
    year,month=map(int,snapshot_period.split('-'));as_of=date(year,month,calendar.monthrange(year,month)[1]);until=as_of+timedelta(days=60)
    where='c.dataset=?';args=['meridian']
    if scope.get('customerId'):where+=' AND c.id=?';args.append(scope['customerId'])
    if scope.get('region'):
        where+=' AND m.region IN (?,?)';args.extend([scope['region'],scope.get('comparison') or scope['region']])
    with connect() as db:
        customers=db.execute(f'SELECT c.id FROM customers c LEFT JOIN customer_master m ON m.dataset=c.dataset AND m.id=c.id WHERE {where}',args).fetchall()
        rows=db.execute(f'SELECT p.* FROM insurance_policies p JOIN customers c ON c.dataset=p.dataset AND c.id=p.customer_id LEFT JOIN customer_master m ON m.dataset=c.dataset AND m.id=c.id WHERE {where} ORDER BY p.end_on,p.id',args).fetchall()
    policies=[]
    for row in rows:
        item=dict(row);item['effectiveStatus']='Cancelled' if item['status']=='cancelled' else 'Not yet active' if item['start_on']>as_of.isoformat() else 'Expired' if item['end_on']<as_of.isoformat() else 'Active'
        item['expiringSoon']=item['effectiveStatus']=='Active' and item['end_on']<=until.isoformat();policies.append(item)
    active={item['customer_id'] for item in policies if item['effectiveStatus']=='Active'}
    return dict(scope=scope,asOf=as_of.isoformat(),version=VERSION,snapshotHash=hashlib.sha256(json.dumps(dict(policies=policies,customers=[row['id'] for row in customers],asOf=as_of.isoformat()),sort_keys=True).encode()).hexdigest(),customers=len(customers),activeCustomers=len(active),withoutActiveCoverage=len(customers)-len(active),expiringSoon=sum(item['expiringSoon'] for item in policies),missingNominee=sum(not item['nominee_complete'] for item in policies if item['effectiveStatus']=='Active'),rows=policies[:30],limitations=['Policies are synthetic observations linked to the same customer IDs. No policy record does not prove that a customer is uninsured elsewhere.','Cover is recorded benefit value, not a recommendation, eligibility decision or claim entitlement. Demographics are not used to infer suitability.','Premiums are annual recorded amounts; no claims or verified payment histories are supplied.'])

@router.get('/insurance/{customer_id}')
def customer_insurance(customer_id:str):return overview(dict(datasetId='meridian',domain='fraud',customerId=customer_id))

def answer(query,scope):
    data=overview(scope)
    from .progress import emit
    emit('Insurance coverage evaluated')
    metrics=[dict(label=label,value=str(value),change='Recorded coverage',direction='neutral',detail='As of '+data['asOf']) for label,value in [('Customers with active cover',data['activeCustomers']),('No active recorded cover',data['withoutActiveCoverage']),('Expiring within 60 days',data['expiringSoon'])]]
    response=dict(id=identifier('MSG'),question=sanitize(query),context=data['scope'],timestamp=now(),title='Insurance coverage & expiry',blocks=[dict(type='TEXT',text=f"{data['activeCustomers']} of {data['customers']} customers have active policies in this synthetic ledger. {data['expiringSoon']} policies expire within 60 days; {data['missingNominee']} active policies have incomplete nominee information."),dict(type='KPI',metrics=metrics),dict(type='TABLE',title='Recorded policies · first 30',data=dict(columns=['Policy','Customer','Product','Cover','Annual premium','Expiry','Status','Nominee'],rows=[[row['id'],row['customer_id'],row['product'],currency(row['cover_minor']/100,'INR'),currency(row['premium_minor']/100,'INR'),row['end_on'],row['effectiveStatus'],'Complete' if row['nominee_complete'] else 'Missing'] for row in data['rows']])),dict(type='EVIDENCE',evidence=[dict(id=VERSION+':'+data['snapshotHash'][:12],title='Coverage source & limits',source=VERSION,detail='Synthetic recorded policies, evaluated at the selected month end.',records=data['limitations'])])],suggestions=['Show insurance coverage in Ahmedabad','Compare insurance coverage by region'])
    response['analysis']=analysis_metadata(data['scope'],response['id']);response['analysis']['datasetVersion']=data['snapshotHash'];response['analysis']['limitations']+=data['limitations'];return response
