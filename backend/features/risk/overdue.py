"""Explainable overdue-principal review from dated schedules and payments."""

import calendar
from datetime import date

from backend.core.database import connect, metadata
from backend.core.formatting import currency, previous_period
from backend.core.identifiers import identifier
from backend.features.products.loans import JOINS, REGION, condition

RULE = dict(
    name="Overdue principal review",
    minCount=1,
    minIncreasePct=None,
    minDaysPastDue=14,
    minOverdueMinor=100000,
    recordUnit="loans",
)
LIMITATIONS = [
    "Repayment dates and amounts are synthetic observations, not bank-confirmed balances or credit decisions.",
    "Principal only: interest, fees, restructures and unrecorded payments are unavailable. A missing schedule is unknown coverage, not proof that a loan is current.",
    "Only payments dated on or before the month-end cutoff reduce due principal. Overpayment is capped at its recorded installment and is not transferred to other installments.",
    "Unlinked repayment records are counted across the dataset because they cannot be reliably assigned to a loan or region.",
    "The 14-day and INR 1,000 thresholds are published demonstration review criteria, not a regulatory default definition or a probability of loss.",
]


def parsed(value):
    try:
        result = date.fromisoformat(value)
        return result if result.isoformat() == value else None
    except (TypeError, ValueError):
        return None


def money(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def cutoff(period):
    year, month = map(int, period.split("-"))
    return date(year, month, calendar.monthrange(year, month)[1])


def load(db, scope):
    if scope["datasetId"] != "meridian":
        raise ValueError("BankShield does not supply linked repayment schedules.")
    sql, args = condition(scope)
    loans = {
        row["id"]: dict(row)
        for row in db.execute(
            f"SELECT l.*,{REGION} region FROM loans l {JOINS} WHERE {sql} ORDER BY l.id",
            args,
        )
    }
    installments = []
    by_id = {}
    for row in db.execute(
        f"SELECT i.* FROM loan_installments i JOIN loans l ON l.dataset=i.dataset AND l.id=i.loan_id {JOINS} WHERE {sql} ORDER BY i.id",
        args,
    ):
        item = {**dict(row), "due": parsed(row["due_on"]), "payments": []}
        installments.append(item)
        by_id[item["id"]] = item
    for row in db.execute(
        f"SELECT p.* FROM loan_payments p JOIN loan_installments i ON i.dataset=p.dataset AND i.id=p.installment_id JOIN loans l ON l.dataset=i.dataset AND l.id=i.loan_id {JOINS} WHERE {sql} ORDER BY p.id",
        args,
    ):
        by_id[row["installment_id"]]["payments"].append(
            {**dict(row), "paid": parsed(row["paid_on"])}
        )
    orphans = []
    orphans.extend(
        parsed(row[0])
        for row in db.execute(
            "SELECT i.due_on FROM loan_installments i WHERE i.dataset=? AND NOT EXISTS(SELECT 1 FROM loans l WHERE l.dataset=i.dataset AND l.id=i.loan_id)",
            (scope["datasetId"],),
        )
    )
    orphans.extend(
        parsed(row[0])
        for row in db.execute(
            "SELECT p.paid_on FROM loan_payments p WHERE p.dataset=? AND NOT EXISTS(SELECT 1 FROM loan_installments i JOIN loans l ON l.dataset=i.dataset AND l.id=i.loan_id WHERE i.dataset=p.dataset AND i.id=p.installment_id)",
            (scope["datasetId"],),
        )
    )
    return dict(loans=loans, installments=installments, orphans=orphans)


def calculate(source, period):
    at = cutoff(period)
    valid = set()
    invalid = set()
    rows = {}
    for item in source["installments"]:
        loan_id = item["loan_id"]
        due = item["due"]
        if due is not None and due > at:
            continue
        if (
            due is None
            or not money(item["principal_due_minor"])
            or not money(source["loans"][loan_id]["principal_minor"])
        ):
            invalid.add(loan_id)
            continue
        paid = 0
        references = []
        for payment in item["payments"]:
            if payment["paid"] is not None and payment["paid"] > at:
                continue
            if payment["paid"] is None or not money(payment["principal_paid_minor"]):
                invalid.add(loan_id)
                continue
            paid += payment["principal_paid_minor"]
            references.append(
                dict(
                    id=payment["id"],
                    paidOn=payment["paid_on"],
                    amountMinor=payment["principal_paid_minor"],
                )
            )
        valid.add(loan_id)
        unpaid = max(0, item["principal_due_minor"] - paid)
        days = (at - due).days if unpaid else 0
        if not unpaid or days < RULE["minDaysPastDue"]:
            continue
        loan = source["loans"][loan_id]
        row = rows.setdefault(
            loan_id,
            dict(
                loanId=loan_id,
                customerId=loan["customer_id"],
                region=loan["region"] or "Not supplied",
                product=loan["loan_type"],
                overdueMinor=0,
                daysPastDue=0,
                oldestDueOn=item["due_on"],
                installments=[],
            ),
        )
        row["overdueMinor"] += unpaid
        row["daysPastDue"] = max(row["daysPastDue"], days)
        row["oldestDueOn"] = min(row["oldestDueOn"], item["due_on"])
        row["installments"].append(
            dict(
                id=item["id"],
                dueOn=item["due_on"],
                dueMinor=item["principal_due_minor"],
                paidMinor=min(paid, item["principal_due_minor"]),
                unpaidMinor=unpaid,
                daysPastDue=days,
                payments=references,
            )
        )
    valid -= invalid
    qualifying = [
        row
        for key, row in rows.items()
        if key in valid and row["overdueMinor"] >= RULE["minOverdueMinor"]
    ]
    qualifying.sort(
        key=lambda row: (-row["daysPastDue"], -row["overdueMinor"], row["loanId"])
    )
    missing = len(set(source["loans"]) - valid - invalid)
    orphan_count = sum(value is None or value <= at for value in source["orphans"])
    amount = sum(row["overdueMinor"] for row in qualifying)
    return dict(
        asOf=at.isoformat(),
        total=len(valid),
        scopedLoans=len(source["loans"]),
        affected=len(qualifying),
        exposure=amount / 100,
        overdueMinor=amount,
        rate=len(qualifying) / len(valid) * 100 if valid else 0,
        newCount=0,
        maxDaysPastDue=max((row["daysPastDue"] for row in qualifying), default=0),
        missingLoans=missing,
        invalidLoans=len(invalid),
        orphanRecords=orphan_count,
        rows=qualifying,
    )


def check(current, prior=None):
    incomplete = (
        current["missingLoans"] or current["invalidLoans"] or current["orphanRecords"]
    )
    matched = current["affected"] >= RULE["minCount"]
    status = (
        "matched"
        if matched
        else "insufficient"
        if not current["total"] or incomplete
        else "clear"
    )
    reason = (
        "Dated unpaid principal meets the published age and amount thresholds."
        if matched
        else "Repayment coverage is incomplete; a clear result cannot be established."
        if status == "insufficient"
        else "No covered loans meet both the overdue-age and principal thresholds."
    )
    if incomplete and matched:
        reason += " Additional loans or source records have incomplete coverage."
    return dict(
        id="RSK-004",
        name=RULE["name"],
        status=status,
        reason=reason,
        currentCount=current["affected"],
        baselineCount=prior["affected"] if prior else None,
        currentTotal=current["total"],
        baselineTotal=prior["total"] if prior else None,
        currentRate=current["rate"],
        baselineRate=prior["rate"] if prior else None,
        increasePct=None,
        rateIncreasePp=None,
        threshold=RULE,
        asOf=current["asOf"],
        overdueMinor=current["overdueMinor"],
        missingLoans=current["missingLoans"],
        invalidLoans=current["invalidLoans"],
        orphanRecords=current["orphanRecords"],
    )


def row_values(row):
    return [
        row["loanId"],
        row["customerId"],
        row["oldestDueOn"],
        row["daysPastDue"],
        currency(row["overdueMinor"] / 100, "INR"),
        len(row["installments"]),
        row["region"],
    ]


COLUMNS = [
    "Loan",
    "Customer",
    "Oldest unpaid due date",
    "Days past due",
    "Overdue principal",
    "Unpaid installments",
    "Region",
]


def current(scope):
    meta = metadata(scope["datasetId"])
    period = meta["periods"][-1] if scope["period"] == "all" else scope["period"]
    with connect() as db:
        db.execute("BEGIN")
        return calculate(load(db, scope), period)


def build(scope):
    meta = metadata(scope["datasetId"])
    period = meta["periods"][-1] if scope["period"] == "all" else scope["period"]
    with connect() as db:
        db.execute("BEGIN")
        source = load(db, scope)
    periods = [p for p in meta["periods"] if p <= period][-6:]
    history = {p: calculate(source, p) for p in periods}
    value = history[period]
    prior = history.get(previous_period(period))
    rule_check = check(value, prior)
    summary = f"As of {value['asOf']}, {value['affected']:,} covered loans have at least INR 1,000 of principal 14 or more days past due. Qualifying overdue principal: {currency(value['exposure'], 'INR')}."
    findings = [
        "Payments after the cutoff do not clear historical overdue principal. Partial payments reduce only their linked installment; full settlement by the cutoff removes it from this signal.",
        f"Coverage: {value['total']:,} loans with usable due observations out of {value['scopedLoans']:,} selected loans. {value['missingLoans']} have no due observations; {value['invalidLoans']} have invalid dates or amounts; {value['orphanRecords']} unlinked source records require reconciliation.",
        "Priority follows oldest qualifying unpaid due date, then overdue principal, then loan ID. It is a review order, not a calibrated fraud or default probability.",
    ]
    segments = {}
    for row in value["rows"]:
        region = segments.setdefault(row["region"], dict(count=0, amount=0, days=0))
        region["count"] += 1
        region["amount"] += row["overdueMinor"]
        region["days"] = max(region["days"], row["daysPastDue"])
    rows = [row_values(row) for row in value["rows"][:20]]
    evidence = [
        dict(
            id=identifier("EV"),
            title="Dated repayment evidence",
            source="Principal schedule and payment records",
            detail=f"Cutoff {value['asOf']}. {value['affected']} qualifying loans; first {len(rows)} shown in priority order.",
            records=[" · ".join(map(str, row)) for row in rows[:6]],
        ),
        dict(
            id=identifier("EV"),
            title="Overdue calculation and coverage",
            source="overdue-principal-v1",
            detail=rule_check["reason"],
            records=[*LIMITATIONS, *findings],
        ),
    ]
    return dict(
        meta=meta,
        current=value,
        prior=prior or dict(total=0, affected=0, exposure=0, rate=0),
        delta=None,
        check=rule_check,
        summary=summary,
        metrics=[
            dict(
                label=label,
                value=number,
                change="As of " + value["asOf"],
                direction="neutral",
                detail=detail,
            )
            for label, number, detail in [
                (
                    "Loans requiring overdue review",
                    f"{value['affected']:,}",
                    "At least 14 days and INR 1,000 unpaid principal",
                ),
                (
                    "Qualifying overdue principal",
                    currency(value["exposure"], "INR"),
                    "Unpaid scheduled principal; not original loan balance or confirmed loss",
                ),
                (
                    "Oldest qualifying overdue age",
                    str(value["maxDaysPastDue"]) + " days",
                    "Age at cutoff; fully settled installments excluded",
                ),
                (
                    "Repayment coverage",
                    f"{value['total']:,} / {value['scopedLoans']:,}",
                    "Loans with usable due observations / selected loans",
                ),
            ]
        ],
        trend=[
            dict(name=calendar.month_abbr[int(p[-2:])], value=history[p]["affected"])
            for p in periods
        ],
        segments=dict(
            columns=[
                "Region",
                "Qualifying loans",
                "Overdue principal",
                "Oldest age (days)",
            ],
            rows=[
                [key, v["count"], currency(v["amount"] / 100, "INR"), v["days"]]
                for key, v in sorted(segments.items())
            ],
        ),
        evidence=evidence,
        findings=findings,
        rows=rows,
        repaymentEvidence=dict(
            asOf=value["asOf"],
            columns=COLUMNS,
            rows=rows,
            loans=value["rows"][:20],
            totalLoans=value["affected"],
            truncated=value["affected"] > 20,
        ),
        limitations=LIMITATIONS,
    )


def event(scope, data):
    current = data["current"]
    return dict(
        id="RSK-004",
        title="Overdue principal requires review",
        category="loans",
        severity="high"
        if current["maxDaysPastDue"] >= 90
        else "medium"
        if current["maxDaysPastDue"] >= 30
        else "low",
        status="Open",
        metric=f"{current['affected']:,} loans · 14+ days",
        changePercentage=0,
        affectedRecords=current["affected"],
        estimatedExposure=current["exposure"],
        currency="INR",
        detectedAt=current["asOf"] + "T00:00:00Z",
        confidence=0,
        summary=data["summary"],
        evidence=data["evidence"],
    )
