"""Allowlisted aggregate/evidence queries and calculated analysis metadata."""

import calendar

from backend.core.database import connect, metadata
from backend.core.formatting import currency, period_label, previous_period
from backend.core.identifiers import identifier
from backend.features.analytics.scope import condition, validate_scope


def aggregate(scope, period=None):
    if scope.get("domain") == "loans":
        from backend.features.products.loans import aggregate as loan_aggregate

        return loan_aggregate(scope, period or scope["period"])
    sql, args = condition(scope, period)
    with connect() as db:
        row = db.execute(
            f"SELECT COUNT(*) total, COALESCE(SUM(flagged),0) affected, COALESCE(SUM(CASE WHEN flagged=1 THEN amount_minor ELSE 0 END),0) amount, COALESCE(SUM(CASE WHEN flagged=1 AND new_device=1 THEN 1 ELSE 0 END),0) new_count FROM transactions WHERE {sql}",
            args,
        ).fetchone()
    return dict(
        total=row["total"],
        affected=row["affected"],
        exposure=row["amount"] / 100,
        rate=row["affected"] / row["total"] * 100 if row["total"] else 0,
        newCount=row["new_count"],
    )


def evidence_rows(scope, offset=0, limit=8):
    if scope.get("domain") == "loans":
        from backend.features.products.loans import evidence_rows as loan_rows

        return loan_rows(scope, offset, limit)
    sql, args = condition(scope)
    with connect() as db:
        rows = db.execute(
            f"SELECT t.*, EXISTS(SELECT 1 FROM accounts a WHERE a.dataset=t.dataset AND a.id=t.account_id) linked_account FROM transactions t WHERE {sql} AND flagged=1 ORDER BY amount_minor DESC,id LIMIT ? OFFSET ?",
            [*args, limit, offset],
        ).fetchall()
    unit = metadata(scope["datasetId"])["currency"]
    return [
        [
            r["id"],
            currency(r["amount_minor"] / 100, unit),
            r["region"],
            r["channel"],
            r["device_id"] or "Not supplied",
            "Available" if r["linked_account"] else "Missing from sample",
        ]
        for r in rows
    ]


def build(scope):
    from backend.core.progress import emit

    validate_scope(scope)
    emit("Scope validated")
    if scope.get("domain") == "loans":
        from backend.features.products.loans import build as loan_build

        return loan_build(scope)
    meta = metadata(scope["datasetId"])
    current, prior = (
        aggregate(scope),
        aggregate(scope, previous_period(scope["period"])),
    )
    emit("SQLite records retrieved")
    has_prior = previous_period(scope["period"]) in meta["periods"]
    delta = (
        (current["affected"] - prior["affected"]) / prior["affected"] * 100
        if prior["affected"]
        else None
    )
    change = (
        f"{delta:+.1f}%"
        if delta is not None and has_prior
        else "No baseline"
        if not has_prior
        else "No prior positives"
    )
    selected = [
        r
        for r in meta["regions"]
        if not scope.get("region") or r in (scope["region"], scope.get("comparison"))
    ]
    region_data = []
    for region in selected:
        ctx = {**scope, "region": region, "comparison": None}
        a, b = aggregate(ctx), aggregate(ctx, previous_period(scope["period"]))
        region_data.append(
            dict(name=region, current=a, prior=b, delta=a["affected"] - b["affected"])
        )
    periods = (
        meta["periods"]
        if scope["period"] == "all"
        else [p for p in meta["periods"] if p <= scope["period"]][-6:]
    )
    trend = [
        dict(
            name=calendar.month_abbr[int(p[-2:])] if meta["id"] == "meridian" else p,
            value=aggregate(scope, p)["affected"],
        )
        for p in periods
    ]
    metrics = [
        dict(
            label=meta["label"],
            value=f"{current['affected']:,}",
            change=change,
            direction="up"
            if delta is not None and delta > 0
            else "down"
            if delta is not None and delta < 0
            else "neutral",
            detail=f"vs. {period_label(previous_period(scope['period']))}",
            sparkline=[p["value"] for p in trend],
        ),
        dict(
            label="Exposure under review"
            if meta["id"] == "meridian"
            else "Labelled transaction value",
            value=currency(current["exposure"], meta["currency"]),
            change="Under review" if meta["id"] == "meridian" else "Synthetic labels",
            direction="neutral",
            detail="Transaction value · not confirmed loss",
        ),
        dict(
            label="Flagged transaction rate"
            if meta["id"] == "meridian"
            else "Synthetic fraud-label rate",
            value=f"{current['rate']:.1f}%",
            change=f"{current['rate'] - prior['rate']:+.2f} pp"
            if has_prior
            else "No baseline",
            direction="neutral",
            detail=f"{current['total']:,} records in scope",
        ),
    ]
    geography = " vs ".join(
        filter(None, [scope.get("region"), scope.get("comparison")])
    ) or ("All regions" if meta["id"] == "meridian" else "All countries")
    summary = (
        f"{meta['label']}: {prior['affected']} → {current['affected']} ({change}). {geography} · {period_label(scope['period'])}."
        if has_prior
        else f"{meta['label']}: {current['affected']}. No preceding-month baseline is available. {geography} · {period_label(scope['period'])}."
    )
    if scope["period"] == "all":
        summary = f"{meta['label']}: {current['affected']:,} out of {current['total']:,} transactions ({current['rate']:.1f}%). {geography} · {period_label(meta['periods'][0])} to {period_label(meta['periods'][-1])}."
        metrics[0].update(change="Full history", detail="All available months")
        metrics[2]["change"] = "Full history"
    leader = max(region_data, key=lambda r: r["delta"]) if region_data else None
    findings = [
        f"{current['newCount']} of {current['affected']} flagged transactions use fixture-marked new devices. This association does not establish fraud or causation."
        if meta["id"] == "meridian"
        else "The sample supports country and merchant-category comparisons. It cannot establish which device performed a transaction or explain a customer-linked fraud ring.",
        f"{leader['name']} contributes {leader['delta']:+} records to the comparison ({leader['prior']['affected']} → {leader['current']['affected']}). Net change across the selected population: {current['affected'] - prior['affected']:+}. This is a descriptive contribution, not a causal explanation."
        if leader and has_prior
        else "No valid comparison is available for this scope.",
    ]
    if not current["total"]:
        findings = [
            "No source records match the current scope. Broaden the filters before drawing conclusions."
        ]
    rows = evidence_rows(scope)
    emit("Metrics reconciled")
    evidence = [
        dict(
            id=identifier("EV"),
            title="Reconciled source records"
            if meta["id"] == "meridian"
            else "Available sample transactions",
            source=f"{meta['name']} · {period_label(scope['period'])}",
            detail=f"{current['affected']} selected records out of {current['total']} transactions in scope. Region filters use {'branch location' if meta['id'] == 'meridian' else 'transaction country'}. Missing parents are not manufactured. Evidence is ordered by value, then source ID.",
            records=[f"{r[0]} · {r[1]} · {r[3]} · account: {r[5]}" for r in rows[:6]],
        ),
        dict(
            id=identifier("EV"),
            title="Coverage & methodology",
            source=meta["name"],
            detail="Rate = selected flagged/labelled transactions divided by all transactions with the same filters and reporting period. Transaction values are not confirmed financial losses.",
            records=[
                f"Currency: {meta['currency']}; period: {period_label(scope['period'])}",
                *meta["limitations"],
                f"Missing dates: {meta['coverage']['missingDates']}; missing account parents: {meta['coverage']['missingAccounts']}; complete customer chains: {meta['coverage']['completeCustomerChains']}.",
            ],
        ),
    ]
    segments = dict(
        columns=[
            "Region / branch" if meta["id"] == "meridian" else "Transaction country",
            "Flagged" if meta["id"] == "meridian" else "Fraud labels",
            "Rate",
            "Transaction value",
            "Count change",
        ],
        rows=[
            [
                r["name"],
                r["current"]["affected"],
                f"{r['current']['rate']:.1f}%",
                currency(r["current"]["exposure"], meta["currency"]),
                f"{r['delta']:+}" if has_prior else "N/A",
            ]
            for r in region_data
        ],
    )
    return dict(
        meta=meta,
        current=current,
        prior=prior,
        delta=delta,
        summary=summary,
        metrics=metrics,
        trend=trend,
        regions=[
            dict(name=r["name"], value=r["current"]["affected"]) for r in region_data
        ],
        segments=segments,
        evidence=evidence,
        findings=findings,
        rows=rows,
    )


def analysis_metadata(scope, run_id):
    meta = metadata(scope["datasetId"])
    from backend.core.progress import completed

    return dict(
        datasetId=meta["id"],
        datasetName=meta["name"],
        period=period_label(scope["period"]),
        baseline="Not applicable"
        if scope["period"] == "all"
        else period_label(previous_period(scope["period"])),
        currency=meta["currency"],
        provider="local",
        datasetVersion=meta["version"],
        runId=run_id,
        stages=list(completed.get() or []),
        externalTransmission=False,
        outboundFields=[],
        limitations=meta["limitations"],
        coverage=meta["coverage"],
    )


def risk(scope, data):
    is_sample = scope["datasetId"] == "bankshield"
    loan = scope.get("domain") == "loans"
    return dict(
        id=scope["riskId"],
        title="BankShield labelled activity"
        if is_sample
        else "Loan default acceleration"
        if loan
        else "Suspicious device cluster"
        if scope["riskId"] == "RSK-003"
        else "Card fraud spike",
        category="loans" if loan else "fraud",
        severity="medium" if is_sample or loan else "high",
        status="Investigating",
        metric=f"{data['current']['affected']} records",
        changePercentage=data["delta"] or 0,
        affectedRecords=data["current"]["affected"],
        estimatedExposure=data["current"]["exposure"],
        currency=data["meta"]["currency"],
        detectedAt=(
            data["meta"]["periods"][-1] if scope["period"] == "all" else scope["period"]
        )
        + "-01T00:00:00Z",
        confidence=0,
        summary=data["summary"],
        evidence=data["evidence"],
    )
