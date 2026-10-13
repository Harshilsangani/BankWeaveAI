"""Loan snapshot tools. Default markers are synthetic, not a repayment ledger."""
import calendar
from .database import connect, metadata
from .import_data import minor

# Imported profiles may have no synthetic customer-master record. Their loan's
# observed branch ID still supplies a region from the existing branch directory.
REGION = 'COALESCE(m.region,b.region)'
JOINS = '''LEFT JOIN customer_master m ON m.dataset=l.dataset AND m.id=l.customer_id
           LEFT JOIN (SELECT dataset,branch_id,MIN(region) region FROM customer_master GROUP BY dataset,branch_id) b
           ON b.dataset=l.dataset AND b.branch_id=l.branch_id'''


def condition(scope):
    sql, args = "l.dataset=?", [scope['datasetId']]
    if scope.get('region'):
        if scope.get('comparison'):
            sql += f' AND {REGION} IN (?,?)'
            args.extend([scope['region'], scope['comparison']])
        else:
            sql += f' AND {REGION}=?'
            args.append(scope['region'])
    if scope.get('minAmount') is not None:
        sql += ' AND l.principal_minor>?'
        args.append(minor(scope['minAmount']))
    if scope.get('customerId'):
        sql += ' AND l.customer_id=?'
        args.append(scope['customerId'])
    return sql, args


def aggregate(scope, period):
    sql, args = condition(scope)
    months = [calendar.month_abbr[int(p[-2:])] for p in metadata(scope['datasetId'])['periods']] if period == 'all' else [calendar.month_abbr[int(period[-2:])]]
    placeholders = ','.join('?' for _ in months)
    with connect() as db:
        row = db.execute(f'''SELECT COUNT(*) total, COALESCE(SUM(affected),0) affected,
          COALESCE(SUM(CASE WHEN affected THEN principal_minor ELSE 0 END),0) amount
          FROM (SELECT l.principal_minor, EXISTS(SELECT 1 FROM json_each(l.default_months) WHERE value IN ({placeholders})) affected
          FROM loans l {JOINS} WHERE {sql})''', [*months, *args]).fetchone()
    return dict(total=row['total'], affected=row['affected'], exposure=row['amount']/100,
                rate=row['affected']/row['total']*100 if row['total'] else 0, newCount=0)


def evidence_rows(scope, offset, limit):
    from .analytics import currency
    sql, args = condition(scope)
    months = [calendar.month_abbr[int(p[-2:])] for p in metadata(scope['datasetId'])['periods']] if scope['period'] == 'all' else [calendar.month_abbr[int(scope['period'][-2:])]]
    placeholders = ','.join('?' for _ in months)
    with connect() as db:
        rows = db.execute(f'''SELECT l.*,{REGION} region FROM loans l {JOINS} WHERE {sql}
          AND EXISTS(SELECT 1 FROM json_each(l.default_months) WHERE value IN ({placeholders}))
          ORDER BY l.principal_minor DESC,l.id LIMIT ? OFFSET ?''',
          [*args, *months, limit, offset]).fetchall()
    return [[r['id'], currency(r['principal_minor']/100, 'INR'), r['region'], r['loan_type'], r['customer_id'], 'Default marker'] for r in rows]


def build(scope):
    from .progress import emit
    from .analytics import previous_period, period_label, currency, identifier
    meta = metadata(scope['datasetId'])
    if scope['datasetId'] != 'meridian':
        raise ValueError('BankShield does not supply loan records.')
    current, prior = aggregate(scope, scope['period']), aggregate(scope, previous_period(scope['period']))
    emit('SQLite loan records retrieved')
    has_prior = previous_period(scope['period']) in meta['periods']
    delta = (current['affected']-prior['affected'])/prior['affected']*100 if prior['affected'] and has_prior else None
    change = f'{delta:+.1f}%' if delta is not None else 'No baseline'
    trend = [dict(name=calendar.month_abbr[int(p[-2:])], value=aggregate(scope,p)['affected']) for p in meta['periods'] if p <= scope['period']][-6:]
    regions = []
    for region in meta['regions']:
        if scope.get('region') and region not in (scope['region'],scope.get('comparison')):
            continue
        ctx = {**scope, 'region': region, 'comparison': None}
        a,b = aggregate(ctx,scope['period']),aggregate(ctx,previous_period(scope['period']))
        regions.append(dict(name=region,current=a,prior=b))
    metrics = [dict(label='Loan defaults',value=str(current['affected']),change=change,direction='up' if (delta or 0)>0 else 'neutral',detail='Synthetic monthly default markers',sparkline=[p['value'] for p in trend]),
      dict(label='Principal under review',value=currency(current['exposure'],'INR'),change='Principal proxy',direction='neutral',detail='Original principal · not outstanding balance or loss'),
      dict(label='Default rate',value=f"{current['rate']:.2f}%",change=f"{current['rate']-prior['rate']:+.2f} pp" if has_prior else 'No baseline',direction='neutral',detail=f"{current['total']:,} loans in scope")]
    geography = ' vs '.join(filter(None,[scope.get('region'),scope.get('comparison')])) or 'All regions'
    summary = f"Loan defaults: {prior['affected']} → {current['affected']} ({change}). {geography} · {period_label(scope['period'])}." if has_prior else f"Loan defaults: {current['affected']}. No preceding-month baseline. {geography} · {period_label(scope['period'])}."
    if scope['period'] == 'all':
        summary = f"Loans with a default marker in any available month: {current['affected']:,} out of {current['total']:,} ({current['rate']:.2f}%). {geography} · {period_label(meta['periods'][0])} to {period_label(meta['periods'][-1])}. Each loan is counted once."
        metrics[0].update(label='Loans with default markers', change='Full history', detail='Distinct loans across all months')
        metrics[2]['change'] = 'Full history'
    rows = evidence_rows(scope,0,8)
    emit('Loan metrics reconciled')
    findings = ['Default markers describe a synthetic monthly snapshot. They do not establish days overdue, repayments or the current outstanding balance.']
    if regions and has_prior:
        lead = max(regions,key=lambda r:r['current']['affected']-r['prior']['affected'])
        findings.append(f"{lead['name']} contributes {lead['current']['affected']-lead['prior']['affected']:+} defaults ({lead['prior']['affected']} → {lead['current']['affected']}). This is a descriptive contribution, not a causal explanation.")
    evidence = [dict(id=identifier('EV'),title='Reconciled loan references',source=f"{meta['name']} · {period_label(scope['period'])}",detail=f"{current['affected']} marked defaults out of {current['total']} loans. Region is the historical customer branch. Evidence is ordered by original principal.",records=[f'{r[0]} · {r[1]} · {r[3]} · {r[4]}' for r in rows]),
      dict(id=identifier('EV'),title='Coverage & methodology',source=meta['name'],detail='Default rate = loans with default markers / all loans in the same scope. For all months, each loan is counted once. Principal is a proxy, not confirmed loss.',records=['Currency: INR','No repayment ledger or verified overdue-day observations are supplied.'])]
    segments = dict(columns=['Region / branch','Defaults','Rate','Original principal','Count change'],rows=[[r['name'],r['current']['affected'],f"{r['current']['rate']:.2f}%",currency(r['current']['exposure'],'INR'),f"{r['current']['affected']-r['prior']['affected']:+}" if has_prior else 'N/A'] for r in regions])
    from .repayments import ledger
    repayment=ledger(scope)
    if repayment['installments']:
        evidence[1]['records'][-1]='Separate principal-only synthetic repayment observations are available; they do not validate these default classifications.'
        evidence.append(dict(id='LEDGER-'+repayment['snapshotHash'][:12],title='Dated repayment observations',source=repayment['version'],detail=f"As of {repayment['asOf']}: {repayment['delinquentLoans']} delinquent loans, {currency(repayment['overduePrincipal'],'INR')} overdue principal. Maximum overdue age {repayment['maxDaysOverdue']} days.",records=repayment['limitations']+[f"{row['id']} · due {row['due_on']} · {row['daysOverdue']} days overdue" for row in repayment['rows'][:5]]))
    return dict(meta=meta,current=current,prior=prior,delta=delta,summary=summary,metrics=metrics,trend=trend,regions=[dict(name=r['name'],value=r['current']['affected']) for r in regions],segments=segments,evidence=evidence,findings=findings,rows=rows)
