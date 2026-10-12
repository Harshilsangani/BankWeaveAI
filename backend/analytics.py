"""Allowlisted SQL tools and deterministic narrative provider for the local fraud feature."""
import calendar
import hashlib
import json
import math
import re
import uuid
from datetime import datetime, timezone

from .database import connect, metadata
from .import_data import minor


def now():
    return datetime.now(timezone.utc).isoformat()


def identifier(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def period_label(period):
    year, month = map(int, period.split("-"))
    return f"{calendar.month_name[month]} {year}"


def previous_period(period):
    year, month = map(int, period.split("-"))
    return f"{year if month > 1 else year - 1}-{month - 1 if month > 1 else 12:02}"


def currency(value, unit):
    if unit == "USD":
        return f"${value:,.2f}"
    if value >= 10_000_000:
        return f"₹{value / 10_000_000:.2f} Cr"
    if value >= 100_000:
        return f"₹{value / 100_000:.2f} L"
    return f"₹{value:,.0f}"


def sanitize(query):
    # Preserve explicitly named monetary filters, while masking identifiers elsewhere.
    amounts = []
    def hold_amount(match):
        amounts.append(match[0])
        return f'[monetary-filter-{chr(65+len(amounts)-1)}]'
    value = re.sub(r'(?:above|over|greater than)\s*[₹$]?\s*[\d,.]+\s*(?:lakh|lac|crore|cr|k)?',hold_amount,query,flags=re.I)
    value = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[email removed]", value)
    value = re.sub(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", "[PAN removed]", value, flags=re.I)
    value = re.sub(r"\b(?:\d[ -]?){10,19}\b", "[identifier removed]", value)
    for index,amount in enumerate(amounts):
        value = value.replace(f'[monetary-filter-{chr(65+index)}]',amount)
    return value


def resolve(query, scope):
    result = dict(scope)
    meta = metadata(result.get("datasetId", "meridian"))
    result["datasetId"] = meta["id"]
    result["period"] = result.get("period") or meta["periods"][-1]
    q = query.lower()
    domain = 'loans' if re.search(r'loan|default|secured|repay|installment|overdue|delinquen|outstanding', q) else 'fraud' if re.search(r'fraud|transaction|card|device', q) else result.get('domain', 'fraud')
    if domain != result.get('domain', 'fraud'):
        for key in ('riskId','newDeviceOnly'):
            result.pop(key, None)
    result['domain'] = domain
    if re.search(r"all regions|all countries|reset|overall|portfolio", q):
        for key in ("region", "comparison", "minAmount", "newDeviceOnly"):
            result.pop(key, None)
    aliases = {"US": ["united states", "usa"], "GB": ["united kingdom", "uk"], "DE": ["germany"], "AE": ["uae"], "FR": ["france"], "ES": ["spain"], "NL": ["netherlands"], "IT": ["italy"], "CH": ["switzerland"], "SE": ["sweden"]}
    mentioned = [r for r in meta["regions"] if any(re.search(r"\b" + re.escape(a.lower()) + r"\b", q) for a in [r, *aliases.get(r, [])])]
    if mentioned:
        if "compare" in q and len(mentioned) == 1 and result.get("region"):
            result["comparison"] = mentioned[0]
        else:
            result["region"] = mentioned[0]
            result["comparison"] = mentioned[1] if "compare" in q and len(mentioned) > 1 else None
    date_match = re.search(r"\b(20\d{2})-(0[1-9]|1[0-2])\b", q)
    if date_match:
        result["period"] = date_match[0]
    else:
        for month in range(1, 13):
            match = re.search(r"\b" + calendar.month_name[month].lower() + r"\s+(20\d{2})\b", q)
            if match:
                result["period"] = f"{match[1]}-{month:02}"
    threshold = re.search(r"(?:above|over|greater than)\s*[₹$]?\s*([\d,.]+)\s*(lakh|lac|crore|cr|k)?", q)
    if threshold:
        result["minAmount"] = float(threshold[1].replace(",", "")) * {"lakh": 100000, "lac": 100000, "crore": 10000000, "cr": 10000000, "k": 1000}.get(threshold[2], 1)
    if "new device" in q or "newly registered" in q:
        result["newDeviceOnly"] = True
    if meta["id"] == "meridian" and re.search(r"investigate.*cluster|largest cluster|investigate that segment", q):
        result.update(region="Ahmedabad", newDeviceOnly=True, riskId="RSK-003")
    result["riskId"] = result.get("riskId") or ("BS-001" if meta["id"] == "bankshield" else "RSK-002" if domain == 'loans' else "RSK-001")
    validate_scope(result)
    return result


def validate_scope(scope):
    meta = metadata(scope.get("datasetId", "meridian"))
    if scope.get('customerId'):
        with connect() as db:
            if not db.execute('SELECT 1 FROM customers WHERE dataset=? AND id=?',(meta['id'],scope['customerId'])).fetchone():
                raise ValueError('The customer is not available in the selected dataset.')
    minimum = scope.get("minAmount")
    if minimum is not None and (not math.isfinite(minimum) or not 0 <= minimum <= 1_000_000_000):
        raise ValueError("Choose a transaction amount threshold between 0 and 1 billion in the source currency.")
    if scope.get("period") and scope["period"] not in meta["periods"]:
        raise ValueError("The selected month is outside this dataset's reporting coverage.")
    for field in ("region", "comparison"):
        if scope.get(field) and scope[field] not in meta["regions"]:
            raise ValueError("Choose a region or country available in the selected dataset.")
    if scope.get("datasetId") == "bankshield" and scope.get("riskId") not in (None, "BS-001"):
        raise ValueError("This risk event does not belong to BankShield.")
    if scope.get("datasetId", "meridian") == "meridian" and scope.get("riskId") not in (None, "RSK-001", "RSK-002", "RSK-003"):
        raise ValueError("Choose a supported Meridian risk event.")
    if scope.get('domain') == 'loans' and scope.get('newDeviceOnly'):
        raise ValueError('A device filter cannot be applied to loan records.')


def condition(scope, period=None):
    sql = "dataset=? AND period=?"
    args = [scope.get("datasetId", "meridian"), period or scope["period"]]
    if scope.get("region"):
        if scope.get("comparison"):
            sql += " AND region IN (?,?)"
            args.extend([scope["region"], scope["comparison"]])
        else:
            sql += " AND region=?"
            args.append(scope["region"])
    if scope.get("minAmount") is not None:
        sql += " AND amount_minor>?"
        args.append(minor(scope["minAmount"]))
    if scope.get("newDeviceOnly"):
        sql += " AND new_device=1"
    if scope.get('customerId'):
        sql += ' AND account_id IN (SELECT id FROM accounts WHERE dataset=? AND customer_id=?)'
        args.extend([scope.get('datasetId','meridian'),scope['customerId']])
    return sql, args


def aggregate(scope, period=None):
    if scope.get('domain') == 'loans':
        from .loans import aggregate as loan_aggregate
        return loan_aggregate(scope, period or scope['period'])
    sql, args = condition(scope, period)
    with connect() as db:
        row = db.execute(f"SELECT COUNT(*) total, COALESCE(SUM(flagged),0) affected, COALESCE(SUM(CASE WHEN flagged=1 THEN amount_minor ELSE 0 END),0) amount, COALESCE(SUM(CASE WHEN flagged=1 AND new_device=1 THEN 1 ELSE 0 END),0) new_count FROM transactions WHERE {sql}", args).fetchone()
    return dict(total=row["total"], affected=row["affected"], exposure=row["amount"] / 100, rate=row["affected"] / row["total"] * 100 if row["total"] else 0, newCount=row["new_count"])


def evidence_rows(scope, offset=0, limit=8):
    if scope.get('domain') == 'loans':
        from .loans import evidence_rows as loan_rows
        return loan_rows(scope, offset, limit)
    sql, args = condition(scope)
    with connect() as db:
        rows = db.execute(f"SELECT t.*, EXISTS(SELECT 1 FROM accounts a WHERE a.dataset=t.dataset AND a.id=t.account_id) linked_account FROM transactions t WHERE {sql} AND flagged=1 ORDER BY amount_minor DESC,id LIMIT ? OFFSET ?", [*args, limit, offset]).fetchall()
    unit = metadata(scope["datasetId"])["currency"]
    return [[r["id"], currency(r["amount_minor"] / 100, unit), r["region"], r["channel"], r["device_id"] or "Not supplied", "Available" if r["linked_account"] else "Missing from sample"] for r in rows]


def build(scope):
    from .progress import emit
    validate_scope(scope)
    emit('Scope validated')
    if scope.get('domain') == 'loans':
        from .loans import build as loan_build
        return loan_build(scope)
    meta = metadata(scope["datasetId"])
    current, prior = aggregate(scope), aggregate(scope, previous_period(scope["period"]))
    emit('SQLite records retrieved')
    has_prior = previous_period(scope["period"]) in meta["periods"]
    delta = (current["affected"] - prior["affected"]) / prior["affected"] * 100 if prior["affected"] else None
    change = f"{delta:+.1f}%" if delta is not None and has_prior else "No baseline" if not has_prior else "No prior positives"
    selected = [r for r in meta["regions"] if not scope.get("region") or r in (scope["region"], scope.get("comparison"))]
    region_data = []
    for region in selected:
        ctx = {**scope, "region": region, "comparison": None}
        a, b = aggregate(ctx), aggregate(ctx, previous_period(scope["period"]))
        region_data.append(dict(name=region, current=a, prior=b, delta=a["affected"] - b["affected"]))
    periods = [p for p in meta["periods"] if p <= scope["period"]][-6:]
    trend = [dict(name=calendar.month_abbr[int(p[-2:])] if meta["id"] == "meridian" else p, value=aggregate(scope, p)["affected"]) for p in periods]
    metrics = [dict(label=meta["label"], value=f'{current["affected"]:,}', change=change, direction="up" if delta is not None and delta > 0 else "down" if delta is not None and delta < 0 else "neutral", detail=f"vs. {period_label(previous_period(scope['period']))}", sparkline=[p["value"] for p in trend]),
               dict(label="Exposure under review" if meta["id"] == "meridian" else "Labelled transaction value", value=currency(current["exposure"], meta["currency"]), change="Under review" if meta["id"] == "meridian" else "Synthetic labels", direction="neutral", detail="Transaction value · not confirmed loss"),
               dict(label="Flagged transaction rate" if meta["id"] == "meridian" else "Synthetic fraud-label rate", value=f'{current["rate"]:.1f}%', change=f'{current["rate"] - prior["rate"]:+.2f} pp' if has_prior else "No baseline", direction="neutral", detail=f'{current["total"]:,} records in scope')]
    geography = " vs ".join(filter(None, [scope.get("region"), scope.get("comparison")])) or ("All regions" if meta["id"] == "meridian" else "All countries")
    summary = f'{meta["label"]}: {prior["affected"]} → {current["affected"]} ({change}). {geography} · {period_label(scope["period"])}.' if has_prior else f'{meta["label"]}: {current["affected"]}. No preceding-month baseline is available. {geography} · {period_label(scope["period"])}.'
    leader = max(region_data, key=lambda r: r["delta"]) if region_data else None
    findings = [f'{current["newCount"]} of {current["affected"]} flagged transactions use fixture-marked new devices. This association does not establish fraud or causation.' if meta["id"] == "meridian" else "The sample supports country and merchant-category comparisons. It cannot establish which device performed a transaction or explain a customer-linked fraud ring.",
                f'{leader["name"]} contributes {leader["delta"]:+} records to the comparison ({leader["prior"]["affected"]} → {leader["current"]["affected"]}). Net change across the selected population: {current["affected"] - prior["affected"]:+}. This is a descriptive contribution, not a causal explanation.' if leader and has_prior else "No valid comparison is available for this scope."]
    if not current["total"]:
        findings = ["No source records match the current scope. Broaden the filters before drawing conclusions."]
    rows = evidence_rows(scope)
    emit('Metrics reconciled')
    evidence = [dict(id=identifier("EV"), title="Reconciled source records" if meta["id"] == "meridian" else "Available sample transactions", source=f'{meta["name"]} · {period_label(scope["period"])}', detail=f'{current["affected"]} selected records out of {current["total"]} transactions in scope. Region filters use {"branch location" if meta["id"] == "meridian" else "transaction country"}. Missing parents are not manufactured. Evidence is ordered by value, then source ID.', records=[f"{r[0]} · {r[1]} · {r[3]} · account: {r[5]}" for r in rows[:6]]),
                dict(id=identifier("EV"), title="Coverage & methodology", source=f'SQLite aggregation · source version {meta["version"][:12]}', detail="Rate = selected flagged/labelled transactions divided by all transactions with the same filters and reporting month. Transaction values are not confirmed financial losses.", records=[f'Currency: {meta["currency"]}; period: {scope["period"]}; baseline: {previous_period(scope["period"])}', *meta["limitations"], f'Missing dates: {meta["coverage"]["missingDates"]}; missing account parents: {meta["coverage"]["missingAccounts"]}; complete customer chains: {meta["coverage"]["completeCustomerChains"]}.'])]
    segments = dict(columns=["Region / branch" if meta["id"] == "meridian" else "Transaction country", "Flagged" if meta["id"] == "meridian" else "Fraud labels", "Rate", "Transaction value", "Count change"], rows=[[r["name"], r["current"]["affected"], f'{r["current"]["rate"]:.1f}%', currency(r["current"]["exposure"], meta["currency"]), f'{r["delta"]:+}' if has_prior else "N/A"] for r in region_data])
    return dict(meta=meta, current=current, prior=prior, delta=delta, summary=summary, metrics=metrics, trend=trend, regions=[dict(name=r["name"], value=r["current"]["affected"]) for r in region_data], segments=segments, evidence=evidence, findings=findings, rows=rows)


def analysis_metadata(scope, run_id):
    meta = metadata(scope["datasetId"])
    from .progress import completed
    return dict(datasetId=meta["id"], datasetName=meta["name"], period=period_label(scope["period"]), baseline=period_label(previous_period(scope["period"])), currency=meta["currency"], provider="local", datasetVersion=meta["version"], runId=run_id, stages=list(completed.get() or []), externalTransmission=False, outboundFields=[], limitations=meta["limitations"], coverage=meta["coverage"])


def persist(kind, payload, scope, query=""):
    from .progress import check_cancelled
    check_cancelled()
    encoded = json.dumps(payload, ensure_ascii=False)
    with connect() as db:
        db.execute("INSERT INTO artifacts VALUES(?,?,?,?)", (payload["id"], kind, encoded, payload.get("timestamp") or payload.get("createdAt") or now()))
        from .sessions import record
        record(db,kind,payload)
        if kind=='report':
            from .report_files import save
            save(db,payload)
        if kind=='investigation':
            from .cases import ensure_case
            ensure_case(db,payload)
        db.execute("INSERT INTO audit_runs VALUES(?,?,?,?,?,?)", (identifier("RUN"), kind, json.dumps(scope), sanitize(query), now(), hashlib.sha256(encoded.encode()).hexdigest()))


def risk(scope, data):
    is_sample = scope["datasetId"] == "bankshield"
    loan = scope.get('domain') == 'loans'
    return dict(id=scope["riskId"], title="BankShield labelled activity" if is_sample else 'Loan default acceleration' if loan else "Suspicious device cluster" if scope["riskId"] == "RSK-003" else "Card fraud spike", category='loans' if loan else "fraud", severity="medium" if is_sample or loan else "high", status="Investigating", metric=f'{data["current"]["affected"]} records', changePercentage=data["delta"] or 0, affectedRecords=data["current"]["affected"], estimatedExposure=data["current"]["exposure"], currency=data["meta"]["currency"], detectedAt=scope["period"] + "-01T00:00:00Z", confidence=0, summary=data["summary"], evidence=data["evidence"])


def investigate(scope):
    from .security import require
    require('analyze')
    data = build(scope)
    from .progress import emit
    emit('Evidence assembled')
    result = dict(id=identifier("INV"), title=risk(scope, data)["title"], risk=risk(scope, data), scope=scope, createdAt=now(), status="In review", metrics=data["metrics"], trend=data["trend"], segments=data["segments"], evidence=data["evidence"], findings=data["findings"], actions=["Review available transaction references and alternative explanations.", "Obtain complete parent records before customer-level escalation." if scope["datasetId"] == "bankshield" else "Validate device and merchant context with an authorized human reviewer.", "No account restriction or payment action is executed by this workspace."], timeline=[dict(time=now(), title=stage, detail="Recorded during this local analysis run.") for stage in ["Scope validated", "Source aggregates computed", "Evidence attached", "Ready for human review"]])
    result["analysis"] = analysis_metadata(scope, result["id"])
    if scope.get('domain')!='loans':
        from .relationships import build as relationship_graph
        result['relationshipGraph']=relationship_graph(scope)
        graph=result['relationshipGraph']
        if graph['available']:
            result['evidence'].append(dict(id='GRAPH-'+graph['snapshotHash'][:12],title='Observed customer/device relationships',source=graph['version'],detail=f"{graph['sampledTransactions']} sampled flagged transactions out of {graph['totalFlaggedTransactions']}. Links are observations, not proof of collusion.",records=[edge['relation']+': '+edge['source']+' → '+edge['target'] for edge in graph['edges'][:12]]))
    if scope.get('domain') == 'loans':
        result['actions'] = ['Review the linked loan references with an authorized credit analyst.', 'Obtain repayment and outstanding-balance evidence before a credit decision.', 'No loan restriction or collection action is executed by this workspace.']
    persist("investigation", result, scope)
    return result


def analyst(query, scope, persist_result=True):
    scope = resolve(query, scope)
    q = sanitize(query)
    if re.search(r'(?:past|last|previous)\s+(?:five|[2-9]|\d{2,})\s+years?|\b(?:five|[2-9]|\d{2,})[ -]year|total credit|credit.*(?:year|trend)|(?:year|trend).*credit',q,re.I):
        meta=metadata(scope['datasetId'])
        first,last=period_label(meta['periods'][0]),period_label(meta['periods'][-1])
        result=dict(id=identifier('MSG'),question=q,context=scope,timestamp=now(),title='Historical data coverage',
                    blocks=[dict(type='TEXT',text=f'The selected dataset covers {first} to {last} and does not provide the requested multi-year series. No multi-year chart can be calculated from these records. For credit analysis, specify whether you mean loan disbursements, outstanding loan balances or incoming account credits. Dated historical records and a consistent definition are required; transaction amounts do not establish a credit/debit direction.')],
                    suggestions=['Show loan repayments and overdue evidence','Why did fraud increase this month?'])
        result['analysis']=analysis_metadata(scope,result['id'])
        if persist_result:persist('analyst',result,scope,query)
        return result
    if scope['datasetId']=='meridian' and re.search(r'financial health|cashflow|cash.flow|income|spending|salary|affordab',q,re.I):
        from .financial_health import answer
        result=answer(query,scope)
        if persist_result:persist('analyst',result,result['context'],query)
        return result
    if re.search(r'recommend|suggest.*customer|declared needs',q,re.I):
        from .recommendations import answer
        result=answer(query,scope)
        if persist_result:persist('analyst',result,result['context'],query)
        return result
    if scope['datasetId']=='meridian' and re.search(r'insurance|coverage gap|nominee',q,re.I):
        from .insurance import answer
        result=answer(query,scope)
        if persist_result:persist('analyst',result,result['context'],query)
        return result
    if scope['datasetId']=='meridian' and re.search(r'repay|installment|overdue|delinquen|outstanding',q,re.I):
        from .repayments import answer
        result=answer(query,scope)
        if persist_result:persist('analyst',result,result['context'],query)
        return result
    response = dict(id=identifier("MSG"), question=q, context=scope, timestamp=now(), title="The signal behind the increase" if re.search("why|factor|investigat", q, re.I) else "Your transaction risk, in focus")
    response["analysis"] = analysis_metadata(scope, response["id"])
    unsupported = scope["datasetId"] == "bankshield" and re.search(r"new.*device|shared.*device|device.*cluster|loan|default|branch|kyc", q, re.I)
    unrelated = not re.search(r"loan|default|secured|branch|fraud|transaction|card|device|risk|country|countries|region|why|compare|investigat|factor|show|only|increase|all|merchant|alert|sample|report|policy|kyc|above|over|scenario|what.if|authentication", q, re.I)
    if unsupported or unrelated:
        response.update(title="Available data coverage", blocks=[dict(type="TEXT", text="This local analyst supports fraud transactions, geography, merchant categories and evidence. BankShield has no transaction-level device links, loans or branches. Select Meridian for its coherent branch/device fixture; use the supported BankShield analyses without inventing missing relationships.")], suggestions=["Show suspicious transactions", "Compare fraud by country", "Show merchant categories"])
    elif re.search("scenario|what.if|authentication", q, re.I):
        if scope["datasetId"] == "bankshield":
            response.update(title="Scenario coverage", blocks=[dict(type="TEXT", text="BankShield has no validated intervention or device telemetry. Authentication scenarios are available only for the coherent Meridian demo fixture.")], suggestions=["Show merchant categories"])
        else:
            response.update(title="Explore an authentication scenario", blocks=[dict(type="TEXT", text="Open the simulator to set authentication coverage and assumed effectiveness for this selected scope. Results are illustrative estimates, not measured forecasts."), dict(type="ACTION", label="Configure authentication scenario", action="simulate", riskId=scope["riskId"])], suggestions=["Show affected transactions"])
    elif re.search("report", q, re.I):
        inv = investigate(scope)
        report = make_report(inv["id"])
        response.update(title="Investigation report prepared", blocks=[dict(type="REPORT", report=report)], suggestions=["Show all regions", "Show suspicious transactions"])
    else:
        data = build(scope)
        blocks = [dict(type="TEXT", text=data["summary"]), dict(type="KPI", metrics=data["metrics"]), dict(type="CHART", title="Flagged transaction trend" if scope["datasetId"] == "meridian" else "Synthetic fraud-label trend", subtitle=f'Historical monthly count · {data["meta"]["name"]}', kind="area", points=data["trend"]), dict(type="CHART", title="Regional risk distribution" if scope["datasetId"] == "meridian" else "Country distribution", subtitle=f'{period_label(scope["period"])} · transaction count', kind="bar", points=data["regions"]), dict(type="TABLE", title="Where the risk is concentrated", data=data["segments"])]
        if re.search("transaction|affected", q, re.I):
            blocks.append(dict(type="TABLE", title="Selected transaction evidence · first 8", data=dict(columns=["Transaction", "Amount", "Region", "Channel", "Device", "Account link"], rows=data["rows"])))
        if scope.get('domain') == 'loans':
            response['title'] = 'A closer look at loan performance'
            blocks[2]['title'] = 'Loan default trend'
            blocks[3]['subtitle'] = f'{period_label(scope["period"])} · default markers'
            blocks.append(dict(type='TABLE',title='Loan evidence · first 8',data=dict(columns=['Loan','Original principal','Region','Product','Customer','Status'],rows=data['rows'])))
        if scope.get('domain') != 'loans' and re.search("merchant", q, re.I):
            sql, args = condition(scope)
            with connect() as db:
                rows = db.execute(f"SELECT merchant,COUNT(*) total,SUM(flagged) affected FROM transactions WHERE {sql} GROUP BY merchant ORDER BY affected DESC,merchant LIMIT 12", args).fetchall()
            blocks.append(dict(type="TABLE", title="Merchant category comparison", data=dict(columns=["Category", "Transactions", "Selected labels/flags"], rows=[[r["merchant"], r["total"], r["affected"]] for r in rows])))
        blocks.extend([dict(type="INSIGHT", title="Patterns worth investigating" if i == 0 else "Contribution to the change", text=f) for i, f in enumerate(data["findings"])])
        blocks.extend([dict(type="EVIDENCE", evidence=data["evidence"]), dict(type="ACTION", label="Open investigation workspace", action="investigate", riskId=scope["riskId"])])
        response.update(blocks=blocks, suggestions=["Only Ahmedabad", "Compare it to Surat", "Show affected transactions", "Generate a report for the risk team"] if scope["datasetId"] == "meridian" else ["Only United States", "Compare it to Germany", "Show merchant categories", "Generate a report"])
    if persist_result:
        persist("analyst", response, scope, q)
    return response


def make_report(investigation_id, scenario=None):
    from .security import require
    from .sessions import artifact_access
    require('analyze')
    artifact_access(investigation_id)
    with connect() as db:
        row = db.execute("SELECT payload FROM artifacts WHERE id=? AND kind='investigation'", (investigation_id,)).fetchone()
    if not row:
        raise ValueError("Investigation not found. Open a saved investigation first.")
    inv = json.loads(row[0])
    result = dict(id=identifier("RPT"), title=inv["title"] + " — investigation report", createdAt=now(), investigation=inv)
    if scenario:
        result["scenario"] = scenario
    persist("report", result, inv["scope"])
    return result
