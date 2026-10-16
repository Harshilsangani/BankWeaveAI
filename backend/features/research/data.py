"""Allowlisted, parameterized research tools. Only aggregates leave this module."""

import calendar
import time

from backend.core.database import connect, metadata
from backend.features.analytics.scope import condition


def money(minor, currency):
    return f"{currency} {minor / 100:,.2f}"


def collect(scope, focus, periods, trend_periods, trace):
    meta = metadata(scope["datasetId"])
    currency = meta["currency"]
    series, tables, facts, metrics, limitations = (
        [],
        [],
        {},
        [],
        list(meta["limitations"]),
    )

    def tool(db, name, sql, args):
        from backend.core.progress import emit

        emit(name, "running")
        started = time.perf_counter()
        rows = [dict(row) for row in db.execute(sql, args).fetchall()]
        trace.append(
            dict(
                tool=name,
                status="succeeded",
                rowCount=len(rows),
                durationMs=round((time.perf_counter() - started) * 1000),
            )
        )
        emit(name)
        return rows

    def chart(key, title, subtitle, rows, field, unit="count"):
        points = [dict(name=str(row["name"]), value=row[field] or 0) for row in rows]
        if not points:
            return
        series.append(
            dict(id=key, title=title, subtitle=subtitle, points=points, unit=unit)
        )
        facts["chart-" + key] = (
            title
            + " ("
            + subtitle
            + "): "
            + "; ".join(
                f"{p['name']}: {currency + ' ' if unit == 'money' else ''}{p['value']:,.2f}"
                if unit == "money"
                else f"{p['name']}: {p['value']:,}"
                for p in points
            )
            + "."
        )

    with connect() as db:
        if focus != "loans":
            sql, args = condition({**scope, "domain": "fraud", "period": "all"})
            where = sql + " AND period IN (" + ",".join("?" for _ in periods) + ")"
            params = [*args, *periods]
            tx = tool(
                db,
                "Transaction summary SQL tool",
                f"""SELECT COUNT(*) total,
                COALESCE(SUM(amount_minor),0) value_minor, COALESCE(SUM(flagged),0) flagged,
                COALESCE(SUM(CASE WHEN flagged=1 THEN amount_minor ELSE 0 END),0) flagged_minor,
                ROUND(100.0*SUM(flagged)/NULLIF(COUNT(*),0),2) flag_rate,
                COUNT(DISTINCT account_id) accounts FROM transactions WHERE {where}""",
                params,
            )[0]
            facts["transaction-summary"] = (
                f"The reporting window contains {tx['total']:,} transactions with gross recorded value {money(tx['value_minor'], currency)} across {tx['accounts']:,} observed account references. Gross value is not net cashflow."
            )
            facts["fraud-summary"] = (
                f"Flagged transactions: {tx['flagged']:,} out of {tx['total']:,} transactions ({tx['flag_rate'] or 0:.2f}%). Flagged value is {money(tx['flagged_minor'], currency)}; it is an unconfirmed review proxy, not financial loss."
            )
            facts["summary"] = (
                facts["fraud-summary"]
                if focus == "fraud"
                else facts["transaction-summary"]
            )
            metrics.extend(
                [
                    dict(
                        label="Transactions in window",
                        value=f"{tx['total']:,}",
                        change="Selected window",
                        direction="neutral",
                        detail="Same date and regional filters",
                    ),
                    dict(
                        label="Gross transaction value",
                        value=money(tx["value_minor"], currency),
                        change="Recorded value",
                        direction="neutral",
                        detail="Not net cashflow or loss",
                    ),
                    dict(
                        label="Flagged transactions",
                        value=f"{tx['flagged']:,}",
                        change=f"{tx['flag_rate'] or 0:.2f}% of transactions",
                        direction="neutral",
                        detail="Synthetic, unconfirmed markers",
                    ),
                ]
            )
            trend_where = (
                sql + " AND period IN (" + ",".join("?" for _ in trend_periods) + ")"
            )
            monthly = tool(
                db,
                "Transaction monthly SQL tool",
                f"""SELECT period name, COUNT(*) total,
                SUM(amount_minor)/100.0 value, SUM(flagged) flagged,
                SUM(CASE WHEN flagged=1 THEN amount_minor ELSE 0 END)/100.0 flagged_value
                FROM transactions WHERE {trend_where} GROUP BY period ORDER BY period""",
                [*args, *trend_periods],
            )
            label = f"{trend_periods[0]} to {trend_periods[-1]}"
            if focus in ("transactions", "cashflow", "portfolio"):
                chart(
                    "transaction_volume",
                    "Monthly transaction volume",
                    label + " · transactions",
                    monthly,
                    "total",
                )
                chart(
                    "transaction_value",
                    "Gross transaction value",
                    label + " · " + currency,
                    monthly,
                    "value",
                    "money",
                )
            if focus in ("fraud", "portfolio"):
                chart(
                    "trend",
                    "Flagged transaction trend",
                    label + " · unconfirmed flags",
                    monthly,
                    "flagged",
                )
            monthly_window = [row for row in monthly if row["name"] in periods]
            tables.append(
                dict(
                    title="Monthly transaction reconciliation",
                    columns=[
                        "Month",
                        "Transactions",
                        "Gross value",
                        "Flags",
                        "Flagged value",
                    ],
                    rows=[
                        [
                            r["name"],
                            f"{r['total']:,}",
                            f"{currency} {r['value']:,.2f}",
                            f"{r['flagged']:,}",
                            f"{currency} {r['flagged_value']:,.2f}",
                        ]
                        for r in monthly_window
                    ],
                )
            )
            for key, column, title in [
                ("geography", "region", "Regional distribution"),
                ("channel", "channel", "Channel mix"),
                ("merchant", "merchant", "Merchant categories"),
            ]:
                rows = tool(
                    db,
                    f"{title} SQL tool",
                    f"""SELECT {column} name,COUNT(*) total,SUM(flagged) flagged,
                    SUM(amount_minor)/100.0 value FROM transactions WHERE {where}
                    GROUP BY {column} ORDER BY {"flagged" if focus == "fraud" else "total"} DESC,{column} LIMIT 10""",
                    params,
                )
                chart(
                    key,
                    title,
                    f"{periods[0]} to {periods[-1]} · "
                    + (
                        "flagged count" if focus == "fraud" else "all transaction count"
                    ),
                    rows,
                    "flagged" if focus == "fraud" else "total",
                )
                if key == "geography":
                    tables.append(
                        dict(
                            title="Regional transaction breakdown",
                            columns=[
                                "Region / country",
                                "Transactions",
                                "Gross value",
                                "Flags",
                            ],
                            rows=[
                                [
                                    r["name"],
                                    f"{r['total']:,}",
                                    f"{currency} {r['value']:,.2f}",
                                    f"{r['flagged']:,}",
                                ]
                                for r in rows
                            ],
                        )
                    )
            facts["transaction-method"] = (
                "Gross transaction value sums recorded monetary amounts in integer minor units. No original debit/credit direction is verified; incoming and outgoing values must use the separate synthetic cashflow ledger. Flag rates divide flagged records by all records with the same filters."
            )

        if focus in ("cashflow", "portfolio"):
            if scope["datasetId"] != "meridian":
                limitations.append(
                    "BankShield supplies no cashflow ledger, verified debit/credit direction or lending history. Cashflow conclusions are unavailable."
                )
            elif scope.get("minAmount") is not None or scope.get("newDeviceOnly"):
                limitations.append(
                    "Cashflow was omitted because amount/device filters belong to transaction records and cannot be transferred to salary or principal payments."
                )
            else:
                where = "c.dataset=?"
                args = ["meridian"]
                if scope.get("customerId"):
                    where += " AND c.id=?"
                    args.append(scope["customerId"])
                if scope.get("region"):
                    where += " AND m.region IN (?,?)"
                    args.extend(
                        [scope["region"], scope.get("comparison") or scope["region"]]
                    )
                marks = ",".join("?" for _ in periods)
                flows = tool(
                    db,
                    "Cashflow monthly SQL tool",
                    f"""SELECT substr(f.occurred_on,1,7) name,
                    SUM(CASE WHEN f.direction='inflow' THEN f.amount_minor ELSE 0 END) income,
                    SUM(CASE WHEN f.direction='outflow' THEN f.amount_minor ELSE 0 END) spending
                    FROM cashflow_events f JOIN customers c ON c.dataset=f.dataset AND c.id=f.customer_id
                    LEFT JOIN customer_master m ON m.dataset=c.dataset AND m.id=c.id
                    WHERE {where} AND substr(f.occurred_on,1,7) IN ({marks}) GROUP BY name ORDER BY name""",
                    [*args, *periods],
                )
                payments = tool(
                    db,
                    "Principal payment monthly SQL tool",
                    f"""SELECT substr(p.paid_on,1,7) name,SUM(p.principal_paid_minor) paid
                    FROM loan_payments p JOIN loan_installments i ON i.dataset=p.dataset AND i.id=p.installment_id
                    JOIN loans l ON l.dataset=i.dataset AND l.id=i.loan_id JOIN customers c ON c.dataset=l.dataset AND c.id=l.customer_id
                    LEFT JOIN customer_master m ON m.dataset=c.dataset AND m.id=c.id
                    WHERE {where} AND substr(p.paid_on,1,7) IN ({marks}) GROUP BY name ORDER BY name""",
                    [*args, *periods],
                )
                paid_by_month = {r["name"]: r["paid"] for r in payments}
                # Final net values are calculated by SQLite from its already aggregated ledger rows.
                cash = []
                for row in flows:
                    calculated = tool(
                        db,
                        "Cashflow net reconciliation SQL tool",
                        "SELECT ? name,? income,? spending,? paid,(?-?-?) net",
                        [
                            row["name"],
                            row["income"],
                            row["spending"],
                            paid_by_month.get(row["name"], 0),
                            row["income"],
                            row["spending"],
                            paid_by_month.get(row["name"], 0),
                        ],
                    )[0]
                    cash.append(calculated)
                total = tool(
                    db,
                    "Cashflow total SQL tool",
                    "SELECT ? income,? spending,? paid,(?-?-?) net",
                    [
                        sum(r["income"] for r in cash),
                        sum(r["spending"] for r in cash),
                        sum(r["paid"] for r in cash),
                        sum(r["income"] for r in cash),
                        sum(r["spending"] for r in cash),
                        sum(r["paid"] for r in cash),
                    ],
                )[0]
                facts["cashflow-summary"] = (
                    f"Synthetic ledger incoming: {money(total['income'], currency)}; outgoing: {money(total['spending'], currency)}; recorded principal payments: {money(total['paid'], currency)}; net flow after principal: {money(total['net'], currency)}. These observations are not verified salary, complete account balances or affordability evidence."
                )
                if not cash:
                    facts["cashflow-summary"] = (
                        "No linked cashflow observations match this window. Incoming, outgoing and net-flow conclusions are unavailable; missing observations are not zero verified income."
                    )
                    limitations.append(
                        "No linked cashflow observations match this scope. Missing income/spending observations are unknown, not evidence of zero income or financial health."
                    )
                if focus == "cashflow":
                    facts["summary"] += " " + facts["cashflow-summary"]
                if cash:
                    metrics.append(
                        dict(
                            label="Synthetic net cashflow",
                            value=money(total["net"], currency),
                            change="After recorded principal",
                            direction="neutral",
                            detail="Generated ledger; incomplete obligations",
                        )
                    )
                for key, field, title in [
                    ("cash_in", "income", "Synthetic incoming cashflow"),
                    ("cash_out", "spending", "Synthetic outgoing cashflow"),
                    ("cash_net", "net", "Synthetic net cashflow"),
                ]:
                    chart(
                        key,
                        title,
                        f"{periods[0]} to {periods[-1]} · {currency}",
                        [dict(name=r["name"], value=r[field] / 100) for r in cash],
                        "value",
                        "money",
                    )
                categories = tool(
                    db,
                    "Cashflow category SQL tool",
                    f"""SELECT f.category name,SUM(f.amount_minor)/100.0 value
                    FROM cashflow_events f JOIN customers c ON c.dataset=f.dataset AND c.id=f.customer_id
                    LEFT JOIN customer_master m ON m.dataset=c.dataset AND m.id=c.id
                    WHERE {where} AND f.direction='outflow' AND substr(f.occurred_on,1,7) IN ({marks})
                    GROUP BY f.category ORDER BY value DESC,f.category LIMIT 10""",
                    [*args, *periods],
                )
                chart(
                    "cash_categories",
                    "Synthetic spending categories",
                    currency + " · recorded outgoing observations",
                    categories,
                    "value",
                    "money",
                )
                tables.append(
                    dict(
                        title="Synthetic cashflow reconciliation",
                        columns=[
                            "Month",
                            "Incoming",
                            "Outgoing",
                            "Principal paid",
                            "Net after principal",
                        ],
                        rows=[
                            [
                                r["name"],
                                *[
                                    money(r[key], currency)
                                    for key in ("income", "spending", "paid", "net")
                                ],
                            ]
                            for r in cash
                        ],
                    )
                )
                limitations.extend(
                    [
                        "Cashflow incoming/opening observations and outgoing transaction classifications are explicitly synthetic; original transactions have no verified debit/credit direction.",
                        "Principal payments are separately recorded. Interest, fees, taxes, insurance payment history, other accounts and external obligations are incomplete; net flow is not an affordability or credit decision.",
                    ]
                )
                facts["cashflow-method"] = (
                    "Net flow equals synthetic incoming minus synthetic outgoing minus separately recorded principal payments for the same months and linked customer/region population. Missing external obligations and unverifiable transaction direction limit interpretation; negative net flow does not establish insolvency."
                )

        if focus in ("loans", "portfolio") and scope["datasetId"] == "meridian":
            from backend.features.products.loans import (
                JOINS,
                REGION,
            )
            from backend.features.products.loans import (
                condition as loan_condition,
            )

            where, args = loan_condition(scope)
            months = [calendar.month_abbr[int(p[-2:])] for p in periods]
            marks = ",".join("?" for _ in months)
            base = f"""SELECT l.*, {REGION} region_name, EXISTS(SELECT 1 FROM json_each(l.default_months) WHERE value IN ({marks})) affected FROM loans l {JOINS} WHERE {where}"""
            totals = tool(
                db,
                "Loan default summary SQL tool",
                f"SELECT COUNT(*) total,SUM(affected) affected,SUM(CASE WHEN affected THEN principal_minor ELSE 0 END) principal FROM ({base})",
                [*months, *args],
            )[0]
            facts["loan-summary"] = (
                f"The scoped portfolio contains {totals['total']:,} loans, with {totals['affected'] or 0:,} distinct loans carrying a synthetic default marker during the reporting window. Defaulted-principal proxy: {money(totals['principal'] or 0, currency)}. Markers are not verified missed-payment outcomes or confirmed losses."
            )
            if focus == "loans":
                facts["summary"] = facts["loan-summary"]
            loan_trend = []
            for period in trend_periods:
                month = calendar.month_abbr[int(period[-2:])]
                loan_trend.extend(
                    tool(
                        db,
                        "Loan default monthly SQL tool",
                        f"SELECT ? name,COUNT(*) value FROM loans l {JOINS} WHERE {where} AND EXISTS(SELECT 1 FROM json_each(l.default_months) WHERE value=?)",
                        [period, *args, month],
                    )
                )
            chart(
                "loan_trend",
                "Loan default trend",
                f"{trend_periods[0]} to {trend_periods[-1]} · synthetic default markers",
                loan_trend,
                "value",
            )
            groups = tool(
                db,
                "Loan type SQL tool",
                f"SELECT loan_type name,SUM(affected) value FROM ({base}) GROUP BY loan_type ORDER BY value DESC,loan_type",
                [*months, *args],
            )
            chart(
                "loan_type",
                "Defaults by loan type",
                "Distinct marked loans in selected window",
                groups,
                "value",
            )
            if focus == "loans":
                regions = tool(
                    db,
                    "Loan region SQL tool",
                    f"SELECT region_name name,SUM(affected) value FROM ({base}) GROUP BY region_name ORDER BY value DESC,region_name",
                    [*months, *args],
                )
                chart(
                    "geography",
                    "Loan defaults by region",
                    "Distinct marked loans in selected window",
                    regions,
                    "value",
                )
            tables.append(
                dict(
                    title="Default markers by month",
                    columns=["Month", "Marked loans"],
                    rows=[
                        [r["name"], r["value"]]
                        for r in loan_trend
                        if r["name"] in periods
                    ],
                )
            )
            metrics.extend(
                [
                    dict(
                        label="Loans in scope",
                        value=f"{totals['total']:,}",
                        change="Scoped portfolio",
                        direction="neutral",
                        detail="Observed loan records",
                    ),
                    dict(
                        label="Loans with default markers",
                        value=f"{totals['affected'] or 0:,}",
                        change="Distinct loans",
                        direction="neutral",
                        detail="Synthetic default markers",
                    ),
                ]
            )
            limitations.append(
                "Loan default markers are synthetic monthly flags. Principal is an exposure proxy; default history alone does not establish repayment outcomes, loss or causation."
            )
    facts["coverage"] = (
        "Reporting window: "
        + periods[0]
        + " to "
        + periods[-1]
        + ". Trend comparison window: "
        + trend_periods[0]
        + " to "
        + trend_periods[-1]
        + ". Currency: "
        + currency
        + ". Filters: "
        + (scope.get("region") or "All regions/countries")
        + ((" versus " + scope["comparison"]) if scope.get("comparison") else "")
        + "."
    )
    facts["limitations"] = " ".join(dict.fromkeys(limitations))
    return dict(
        facts=facts,
        series=series,
        tables=tables,
        metrics=metrics,
        limitations=list(dict.fromkeys(limitations)),
        periods=periods,
        trendPeriods=trend_periods,
    )
