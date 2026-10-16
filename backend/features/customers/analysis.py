"""Read-only customer summaries and ranked database evidence."""

from backend.core.database import connect, metadata
from backend.core.formatting import currency, period_label
from backend.core.identifiers import identifier, now
from backend.core.privacy import sanitize
from backend.features.analytics.queries import aggregate, analysis_metadata
from backend.features.analytics.scope import condition


def directory_answer(query, scope):
    """Return observed directory counts, alongside period-filtered activity."""
    meta = metadata(scope["datasetId"])
    where, args = "c.dataset=?", [scope["datasetId"]]
    if scope.get("customerId"):
        where += " AND c.id=?"
        args.append(scope["customerId"])
    if scope.get("region"):
        regions = [scope["region"], scope.get("comparison") or scope["region"]]
        if scope["datasetId"] == "meridian":
            where += " AND EXISTS(SELECT 1 FROM customer_master m WHERE m.dataset=c.dataset AND m.id=c.id AND m.region IN (?,?))"
        else:
            where += " AND EXISTS(SELECT 1 FROM accounts a JOIN transactions t ON t.dataset=a.dataset AND t.account_id=a.id WHERE a.dataset=c.dataset AND a.customer_id=c.id AND t.region IN (?,?))"
        args.extend(regions)
    with connect() as db:
        customers = db.execute(
            f"SELECT COUNT(*) FROM customers c WHERE {where}", args
        ).fetchone()[0]
        accounts = db.execute(
            f"SELECT COUNT(*) FROM accounts a WHERE a.dataset=?"
            + (
                f" AND EXISTS(SELECT 1 FROM customers c WHERE c.dataset=a.dataset AND c.id=a.customer_id AND {where})"
                if scope.get("region") or scope.get("customerId")
                else ""
            ),
            [scope["datasetId"], *args]
            if scope.get("region") or scope.get("customerId")
            else [scope["datasetId"]],
        ).fetchone()[0]
    activity = aggregate({**scope, "domain": "fraud"})
    labels = [
        ("Customers", customers),
        ("Accounts", accounts),
        ("Transactions", activity["total"]),
    ]
    blocks = [
        dict(
            type="TEXT",
            text=f"{meta['name']} contains {customers:,} recorded customers and {accounts:,} accounts in the selected directory scope. There are {activity['total']:,} transactions for {period_label(scope['period']).lower()}. Customer and account counts describe the current source directory; historical directory snapshots are unavailable.",
        ),
        dict(
            type="KPI",
            metrics=[
                dict(
                    label=label,
                    value=f"{value:,}",
                    change="Recorded data",
                    direction="neutral",
                    detail="Selected period"
                    if label == "Transactions"
                    else "Current directory",
                )
                for label, value in labels
            ],
        ),
    ]
    if scope["datasetId"] == "bankshield" and scope.get("region"):
        blocks.append(
            dict(
                type="TEXT",
                text="Country-filtered directory counts include only customers with an observed account-to-transaction link. Missing sample relationships are excluded.",
            )
        )
    response = dict(
        id=identifier("MSG"),
        question=sanitize(query),
        context=scope,
        timestamp=now(),
        title="Your banking records",
        blocks=blocks,
        suggestions=[
            "Show suspicious transactions",
            "Compare fraud by region",
            "Show merchant categories",
        ],
    )
    response["analysis"] = analysis_metadata(scope, response["id"])
    return response


def ranked_customers(query, scope, plan):
    """Rank observed records with fixed queries and an explicitly named basis."""
    metric, limit = plan["ranking"], plan["limit"]
    meta = metadata(scope["datasetId"])
    from backend.core.progress import emit

    emit("Customer records retrieved", "running")
    scope = {**scope, "view": "customer_ranking", "ranking": metric, "limit": limit}
    if metric == "loan_principal":
        if scope["datasetId"] != "meridian":
            result = directory_answer(query, scope)
            result["blocks"].insert(
                0,
                dict(
                    type="TEXT",
                    text="BankShield supplies no loan records, so customers cannot be ranked by borrowing. Here are its observed directory counts.",
                ),
            )
            return result
        from backend.features.products.loans import JOINS
        from backend.features.products.loans import condition as loan_condition

        sql, args = loan_condition(scope)
        statement = f"""SELECT l.customer_id id, COALESCE(p.full_name,l.customer_id) name,
          COUNT(*) records, SUM(l.principal_minor) value
          FROM loans l {JOINS} JOIN customers c ON c.dataset=l.dataset AND c.id=l.customer_id
          LEFT JOIN customer_profiles p ON p.dataset=c.dataset AND p.id=c.id
          WHERE {sql} GROUP BY l.customer_id ORDER BY value DESC,l.customer_id LIMIT ?"""
        scope["domain"] = "loans"
        basis, record_label = "recorded original loan principal", "Loans"
        note = "Loan principal is a source snapshot, not a dated disbursement series, outstanding balance or account balance."
    else:
        scope["domain"] = "fraud"
        sql, args = condition(scope)
        value = "COUNT(*)" if metric == "transaction_count" else "SUM(t.amount_minor)"
        statement = f"""SELECT c.id, COALESCE(p.full_name,c.id) name, COUNT(*) records, {value} value
          FROM (SELECT account_id,amount_minor FROM transactions WHERE {sql}) t
          JOIN accounts a ON a.dataset=? AND a.id=t.account_id
          JOIN customers c ON c.dataset=a.dataset AND c.id=a.customer_id
          LEFT JOIN customer_profiles p ON p.dataset=c.dataset AND p.id=c.id
          GROUP BY c.id ORDER BY value DESC,c.id LIMIT ?"""
        args = [*args, scope["datasetId"]]
        basis = (
            "recorded transaction count"
            if metric == "transaction_count"
            else "recorded transaction value"
        )
        record_label = "Transactions"
        note = "Transaction value includes all matching transactions, not just flags. It does not represent account balance, income or verified credit/debit totals."
    with connect() as db:
        rows = db.execute(statement, [*args, limit]).fetchall()
    emit("Customer ranking calculated")
    formatted = [
        [
            row["id"],
            row["name"],
            row["records"],
            f"{row['value']:,}"
            if metric == "transaction_count"
            else currency(row["value"] / 100, meta["currency"]),
        ]
        for row in rows
    ]
    text = (
        f"Top {len(rows)} customers by {basis} · {meta['name']} · {period_label(scope['period'])}. {note}"
        if rows
        else "No linked customer records match this scope. Try another month or broaden the region filter."
    )
    if scope["datasetId"] == "bankshield":
        text += " Only observed account-to-customer links are included; unlinked sample transactions cannot be attributed to customers."
    response = dict(
        id=identifier("MSG"),
        question=sanitize(query),
        context=scope,
        timestamp=now(),
        title=f"Top customers by {basis}",
        blocks=[
            dict(type="TEXT", text=text),
            dict(
                type="TABLE",
                title="Customer ranking",
                data=dict(
                    columns=[
                        "Customer ID",
                        "Name",
                        record_label,
                        "Transaction count"
                        if metric == "transaction_count"
                        else "Transaction value"
                        if metric == "transaction_value"
                        else "Original principal",
                    ],
                    rows=formatted,
                ),
            ),
            dict(
                type="CHART",
                title=f"Top customers by {basis}",
                subtitle=meta["currency"]
                if metric != "transaction_count"
                else "Transaction count",
                kind="bar",
                points=[
                    dict(
                        name=row["id"],
                        value=row["value"]
                        if metric == "transaction_count"
                        else row["value"] / 100,
                    )
                    for row in rows
                ],
            ),
        ],
        suggestions=[
            "Only Ahmedabad",
            "Show top 5 customers by loan principal",
            "Show suspicious transactions",
        ]
        if scope["datasetId"] == "meridian"
        else ["Only United States", "Show merchant categories"],
    )
    response["analysis"] = analysis_metadata(scope, response["id"])
    return response
