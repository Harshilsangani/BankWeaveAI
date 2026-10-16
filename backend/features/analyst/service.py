"""Database-grounded analytical answers and rich response blocks."""

import re

from backend.core.database import connect, metadata
from backend.core.formatting import period_label
from backend.core.identifiers import identifier, now
from backend.core.privacy import sanitize
from backend.features.analytics.queries import analysis_metadata, build
from backend.features.analytics.scope import condition, resolve
from backend.features.customers.analysis import directory_answer, ranked_customers
from backend.features.investigations.service import investigate
from backend.features.reports.service import make_report
from backend.features.workspaces.artifacts import persist


def analyst(query, scope, persist_result=True, plan=None):
    scope = resolve(query, scope)
    q = sanitize(query)
    from backend.integrations.ai import LocalProvider, RouteDecision

    plan = RouteDecision.model_validate(
        plan or LocalProvider().route(q, scope)
    ).model_dump()
    if plan["intent"] == "customer_ranking":
        result = ranked_customers(q, scope, plan)
        if persist_result:
            persist("analyst", result, result["context"], q)
        return result
    # A new analytical question replaces the previous customer view.
    for key in ("view", "ranking", "limit"):
        scope.pop(key, None)
    if re.search(
        r"(?:past|last|previous)\s+(?:five|[2-9]|\d{2,})\s+years?|\b(?:five|[2-9]|\d{2,})[ -]year|total credit|credit.*(?:year|trend)|(?:year|trend).*credit",
        q,
        re.I,
    ):
        meta = metadata(scope["datasetId"])
        first, last = (
            period_label(meta["periods"][0]),
            period_label(meta["periods"][-1]),
        )
        result = dict(
            id=identifier("MSG"),
            question=q,
            context=scope,
            timestamp=now(),
            title="Historical data coverage",
            blocks=[
                dict(
                    type="TEXT",
                    text=f"The selected dataset covers {first} to {last} and does not provide the requested multi-year series. No multi-year chart can be calculated from these records. For credit analysis, specify whether you mean loan disbursements, outstanding loan balances or incoming account credits. Dated historical records and a consistent definition are required; transaction amounts do not establish a credit/debit direction.",
                )
            ],
            suggestions=[
                "Show loan repayments and overdue evidence",
                "Why did fraud increase this month?",
            ],
        )
        result["analysis"] = analysis_metadata(scope, result["id"])
        if persist_result:
            persist("analyst", result, scope, query)
        return result
    if scope["datasetId"] == "meridian" and re.search(
        r"financial health|cashflow|cash.flow|income|spending|salary|affordab", q, re.I
    ):
        from backend.features.products.cashflow import answer

        result = answer(query, scope)
        if persist_result:
            persist("analyst", result, result["context"], query)
        return result
    if re.search(r"recommend|suggest.*customer|declared needs", q, re.I):
        from backend.features.products.recommendations import answer

        result = answer(query, scope)
        if persist_result:
            persist("analyst", result, result["context"], query)
        return result
    if scope["datasetId"] == "meridian" and re.search(
        r"insurance|coverage gap|nominee", q, re.I
    ):
        from backend.features.products.insurance import answer

        result = answer(query, scope)
        if persist_result:
            persist("analyst", result, result["context"], query)
        return result
    if scope["datasetId"] == "meridian" and re.search(
        r"repay|installment|overdue|delinquen|outstanding", q, re.I
    ):
        from backend.features.products.repayments import answer

        result = answer(query, scope)
        if persist_result:
            persist("analyst", result, result["context"], query)
        return result
    if plan["intent"] == "customer_summary" or (
        re.search(
            r"\b(?:customer|customers|client|clients|account|accounts|database|dataset|records)\b",
            q,
            re.I,
        )
        and not re.search(
            r"fraud|risk|loan|default|merchant|device|investigat|report|transaction|credit|kyc",
            q,
            re.I,
        )
    ):
        result = directory_answer(q, scope)
        if persist_result:
            persist("analyst", result, scope, q)
        return result
    response = dict(
        id=identifier("MSG"),
        question=q,
        context=scope,
        timestamp=now(),
        title="The signal behind the increase"
        if re.search("why|factor|investigat", q, re.I)
        else "Your transaction risk, in focus",
    )
    response["analysis"] = analysis_metadata(scope, response["id"])
    unsupported = scope["datasetId"] == "bankshield" and re.search(
        r"new.*device|shared.*device|device.*cluster|loan|default|branch|kyc", q, re.I
    )
    coverage_note = None
    if unsupported:
        coverage_note = "BankShield does not contain loan or branch records, or transaction-level device links. The results below show its available transaction and fraud-label evidence. Select Meridian to analyze loans, branches or linked devices."
        scope = {key: value for key, value in scope.items() if key != "newDeviceOnly"}
        scope.update(domain="fraud", riskId="BS-001")
        response.update(context=scope, title="Available transaction evidence")
    if not unsupported and re.search("scenario|what.if|authentication", q, re.I):
        if scope["datasetId"] == "bankshield":
            response.update(
                title="Scenario coverage",
                blocks=[
                    dict(
                        type="TEXT",
                        text="BankShield has no validated intervention or device telemetry. Authentication scenarios are available only for the coherent Meridian demo fixture.",
                    )
                ],
                suggestions=["Show merchant categories"],
            )
        else:
            response.update(
                title="Scenario Simulator retired",
                blocks=[
                    dict(
                        type="TEXT",
                        text="The workspace now includes Card Campaigns for preparing employee reports. New authentication simulations are retired from the interface; saved scenario reports remain readable.",
                    )
                ],
                suggestions=["Show affected transactions"],
            )
    elif not unsupported and re.search("report", q, re.I):
        inv = investigate(scope)
        report = make_report(inv["id"])
        response.update(
            title="Investigation report prepared",
            blocks=[dict(type="REPORT", report=report)],
            suggestions=["Show all regions", "Show suspicious transactions"],
        )
    else:
        data = build(scope)
        blocks = [
            dict(type="TEXT", text=data["summary"]),
            dict(type="KPI", metrics=data["metrics"]),
            dict(
                type="CHART",
                title="Flagged transaction trend"
                if scope["datasetId"] == "meridian"
                else "Synthetic fraud-label trend",
                subtitle=f"Historical monthly count · {data['meta']['name']}",
                kind="area",
                points=data["trend"],
            ),
            dict(
                type="CHART",
                title="Regional risk distribution"
                if scope["datasetId"] == "meridian"
                else "Country distribution",
                subtitle=f"{period_label(scope['period'])} · transaction count",
                kind="bar",
                points=data["regions"],
            ),
            dict(
                type="TABLE",
                title="Where the risk is concentrated",
                data=data["segments"],
            ),
        ]
        if re.search("transaction|affected", q, re.I):
            blocks.append(
                dict(
                    type="TABLE",
                    title="Selected transaction evidence · first 8",
                    data=dict(
                        columns=[
                            "Transaction",
                            "Amount",
                            "Region",
                            "Channel",
                            "Device",
                            "Account link",
                        ],
                        rows=data["rows"],
                    ),
                )
            )
        if scope.get("domain") == "loans":
            response["title"] = "A closer look at loan performance"
            blocks[2]["title"] = "Loan default trend"
            blocks[3]["subtitle"] = f"{period_label(scope['period'])} · default markers"
            blocks.append(
                dict(
                    type="TABLE",
                    title="Loan evidence · first 8",
                    data=dict(
                        columns=[
                            "Loan",
                            "Original principal",
                            "Region",
                            "Product",
                            "Customer",
                            "Status",
                        ],
                        rows=data["rows"],
                    ),
                )
            )
        if scope.get("domain") != "loans" and re.search("merchant", q, re.I):
            sql, args = condition(scope)
            with connect() as db:
                rows = db.execute(
                    f"SELECT merchant,COUNT(*) total,SUM(flagged) affected FROM transactions WHERE {sql} GROUP BY merchant ORDER BY affected DESC,merchant LIMIT 12",
                    args,
                ).fetchall()
            blocks.append(
                dict(
                    type="TABLE",
                    title="Merchant category comparison",
                    data=dict(
                        columns=["Category", "Transactions", "Selected labels/flags"],
                        rows=[[r["merchant"], r["total"], r["affected"]] for r in rows],
                    ),
                )
            )
        blocks.extend(
            [
                dict(
                    type="INSIGHT",
                    title="Patterns worth investigating"
                    if i == 0
                    else "Contribution to the change",
                    text=f,
                )
                for i, f in enumerate(data["findings"])
            ]
        )
        blocks.extend(
            [
                dict(type="EVIDENCE", evidence=data["evidence"]),
                dict(
                    type="ACTION",
                    label="Open investigation workspace",
                    action="investigate",
                    riskId=scope["riskId"],
                ),
            ]
        )
        from backend.integrations.ai import get_provider

        provider = get_provider()
        if provider.external:
            explanation = provider.explain_analysis(q, scope, data)
            blocks[0]["text"] = explanation.text
            chart_blocks = dict(trend=blocks[2], geography=blocks[3])
            for selection in explanation.charts:
                chart_blocks[selection.reference]["kind"] = selection.kind
        response.update(
            blocks=blocks,
            suggestions=[
                "Only Ahmedabad",
                "Compare it to Surat",
                "Show affected transactions",
                "Generate a report for the risk team",
            ]
            if scope["datasetId"] == "meridian"
            else [
                "Only United States",
                "Compare it to Germany",
                "Show merchant categories",
                "Generate a report",
            ],
        )
        if coverage_note:
            blocks.insert(0, dict(type="TEXT", text=coverage_note))
    if persist_result:
        persist("analyst", response, scope, q)
    return response
