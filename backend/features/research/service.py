"""Research briefs: scope, database series, chart choice, and a PDF export.

Chart points are calculated here. A model may only choose a series that was
calculated and a chart kind allowed for that series.
"""

import re

from backend.core.database import connect, metadata
from backend.core.identifiers import identifier, now
from backend.core.privacy import sanitize
from backend.features.analytics.queries import analysis_metadata
from backend.features.analytics.scope import resolve
from backend.integrations.ai import ResearchChartChoice, ResearchChartPlan

SERIES_CATALOG = (
    dict(
        id="trend",
        datasets=("meridian", "bankshield"),
        label="Monthly flagged or labelled transaction counts",
    ),
    dict(
        id="geography",
        datasets=("meridian", "bankshield"),
        label="Flagged counts by region or country",
    ),
    dict(
        id="channel",
        datasets=("meridian", "bankshield"),
        label="Flagged counts by channel",
    ),
    dict(
        id="merchant",
        datasets=("meridian", "bankshield"),
        label="Flagged counts by merchant category",
    ),
    dict(id="loan_trend", datasets=("meridian",), label="Monthly loan default markers"),
    dict(id="loan_type", datasets=("meridian",), label="Default markers by loan type"),
    *[
        dict(id=key, datasets=datasets, label=label)
        for key, datasets, label in [
            (
                "transaction_volume",
                ("meridian", "bankshield"),
                "Monthly count of all transactions",
            ),
            (
                "transaction_value",
                ("meridian", "bankshield"),
                "Gross recorded transaction value",
            ),
            ("cash_in", ("meridian",), "Synthetic incoming ledger amounts"),
            ("cash_out", ("meridian",), "Synthetic outgoing ledger amounts"),
            (
                "cash_net",
                ("meridian",),
                "Synthetic net flow after recorded principal payments",
            ),
            (
                "cash_categories",
                ("meridian",),
                "Synthetic outgoing spending categories",
            ),
        ]
    ],
)
DEFAULT_KIND = dict(
    trend="area",
    loan_trend="area",
    geography="bar",
    merchant="bar",
    channel="donut",
    loan_type="donut",
    transaction_volume="area",
    transaction_value="column",
    cash_in="column",
    cash_out="column",
    cash_net="area",
    cash_categories="bar",
)
ALLOWED_KIND = {
    key: {"area", "column"}
    if key
    in (
        "trend",
        "loan_trend",
        "transaction_volume",
        "transaction_value",
        "cash_in",
        "cash_out",
        "cash_net",
    )
    else {"donut", "column"}
    if key in ("channel", "loan_type")
    else {"bar", "column"}
    for key in DEFAULT_KIND
}
RESEARCH_WORDS = re.compile(
    r"\bresearch\b|\bbriefing\b|\bdeep[\s-]?dive\b|\blandscape\b|\bcomprehensive (?:analysis|review|brief)\b|\b(?:full|detailed|in-depth)\s+(?:report|analysis)\b",
    re.I,
)


def is_research_question(query):
    return bool(RESEARCH_WORDS.search(query or ""))


def catalog_for(dataset_id):
    return [
        dict(id=item["id"], label=item["label"])
        for item in SERIES_CATALOG
        if dataset_id in item["datasets"]
    ]


def apply_plan(facts, series, plan):
    available = {item["id"]: item for item in series}
    selected = []
    for chart in plan.charts:
        item = available.get(chart.series)
        if (
            item
            and chart.series not in {picked["id"] for picked in selected}
            and chart.kind in ALLOWED_KIND[chart.series]
        ):
            selected.append({**item, "kind": chart.kind})
    if not selected:
        selected = [{**item, "kind": DEFAULT_KIND[item["id"]]} for item in series[:4]]
    text = plan.text
    placeholders = re.findall(r"\{([^{}]+)\}", text)
    prose = re.sub(r"\{[^{}]+\}", "", text)
    invalid = (
        not text.startswith("{summary}")
        or not placeholders
        or set(placeholders) - facts.keys()
        or re.search(
            r"[\d{}]|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\b",
            prose,
            re.I,
        )
    )
    if invalid:
        text = facts["summary"]
    else:
        text = re.sub(r"\{([^{}]+)\}", lambda match: facts[match[1]], text)
    return text, selected


def validate_prose(text, facts):
    references = re.findall(r"\{([^{}]+)\}", text)
    prose = re.sub(r"\{[^{}]+\}", "", text)
    if set(references) - facts.keys() or re.search(
        r"[\d{}]|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\b",
        prose,
        re.I,
    ):
        raise ValueError(
            "The research prose contains an unsupported source reference or numerical claim."
        )


def substitute(text, facts):
    validate_prose(text, facts)
    return re.sub(r"\{([^{}]+)\}", lambda match: facts[match[1]], text)


def requested_months(query):
    match = re.search(
        r"\b(?:last|past|previous)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*mon\w*",
        query,
        re.I,
    )
    if not match:
        return None
    words = dict(
        zip(
            "one two three four five six seven eight nine ten eleven twelve".split(),
            range(1, 13),
        )
    )
    value = int(match[1]) if match[1].isdigit() else words[match[1].lower()]
    if not 1 <= value <= 12:
        raise ValueError("Choose a research window between one and twelve months.")
    return value


def infer_focus(query):
    cash = bool(
        re.search(
            r"cash[ -]?flow|incoming|outgoing|income|spending|salary", query, re.I
        )
    )
    loan = bool(re.search(r"loan|default|repay|lending", query, re.I))
    fraud = bool(re.search(r"fraud|suspicious|flagged|risk|device", query, re.I))
    transaction = bool(re.search(r"transaction|merchant|channel", query, re.I))
    if loan and (cash or transaction or fraud):
        return "portfolio"
    if loan:
        return "loans"
    if cash:
        return "cashflow"
    if fraud:
        return "fraud"
    if transaction:
        return "transactions"
    return "fraud"


def local_plan(facts, series):
    from backend.integrations.ai import ResearchSection

    # This is explicitly labeled a data-only fallback, never represented as model research.
    sections = [
        ResearchSection(
            heading="Verified observations",
            body="\n\n".join(
                "{" + key + "}"
                for key in (
                    "transaction-summary",
                    "fraud-summary",
                    "cashflow-summary",
                    "loan-summary",
                )
                if key in facts
            )
            or "{summary}",
        ),
        ResearchSection(
            heading="Method and scope",
            body="{coverage} The reporting population and date filters are held constant across each reconciliation. Chart values are supplied by read-only database tools. Broad comparison history is labeled separately from the reporting window.",
        ),
        ResearchSection(
            heading="Interpretation limits",
            body="{limitations} The tables describe the available observations. Differences across regions, channels or categories are associations; underlying customer populations and recorded activity can differ. A source review is needed before attributing a cause.",
        ),
        ResearchSection(
            heading="Evidence review",
            body="Reconcile the monthly totals against the source ledger, inspect the scope and currency, and check the data-quality notes. Review relevant source classifications before interpreting an apparent change. Compare like populations and avoid treating partial observations as a complete account history.",
        ),
        ResearchSection(
            heading="Follow-up questions",
            body="Request narrower regional or category comparisons when the supplied data supports them. Obtain verified transaction direction and complete obligation history before financial conclusions. Record any missing evidence and repeat the analysis only when a reviewed source version is available.",
        ),
    ]
    sections = [item for item in sections if item.body]
    return ResearchChartPlan(
        text="{summary}",
        charts=[
            ResearchChartChoice(
                series=item["id"],
                kind=DEFAULT_KIND[item["id"]],
                caption="{chart-" + item["id"] + "}"
                if "chart-" + item["id"] in facts
                else "",
            )
            for item in series[:6]
        ],
        sections=sections,
    )


def answer(query, scope):
    import time

    from backend.core.progress import emit
    from backend.features.research.data import collect
    from backend.integrations.ai import (
        LocalProvider,
        get_provider,
        provider_calls,
        transmission_fields,
    )

    started = time.perf_counter()
    calls = provider_calls.get()
    sent = transmission_fields.get()
    if calls is None:
        calls = []
    if sent is None:
        sent = []
    tools = []
    warnings = []
    phases = []
    call_token = provider_calls.set(calls)
    sent_token = transmission_fields.set(sent)
    try:
        scope = resolve(
            query,
            {**scope, "domain": "fraud"}
            if (
                scope.get("datasetId") == "bankshield"
                and infer_focus(query) in ("loans", "portfolio")
            )
            else scope,
        )
        scope.pop("research", None)
        meta = metadata(scope["datasetId"])
        provider = get_provider()
        emit("Research scope agent", "running")
        stage = time.perf_counter()
        context = {
            **scope,
            "datasetName": meta["name"],
            "currency": meta["currency"],
            "availablePeriods": meta["periods"],
            "availableRegions": meta["regions"],
            "limitations": meta["limitations"],
        }
        try:
            decision = provider.scope_research(
                sanitize(query), catalog_for(meta["id"]), context
            )
            scope_mode = "model" if provider.external else "local"
        except ValueError as error:
            decision = LocalProvider().scope_research(
                query, catalog_for(meta["id"]), context
            )
            scope_mode = "fallback"
            warnings.append(
                "Scope agent unavailable or invalid; explicit query filters and local scope rules were used."
            )
        focus = decision.focus
        explicit = infer_focus(query)
        if explicit in ("cashflow", "transactions", "loans", "portfolio"):
            focus = explicit
        if meta["id"] == "bankshield" and focus == "loans":
            focus = "transactions"
            warnings.append(
                "BankShield has no loan tables. Research uses available transactions; no loan records were invented."
            )
        if meta["id"] == "bankshield" and focus == "cashflow":
            warnings.append(
                "BankShield has no cashflow ledger. Only available transaction evidence can be reported."
            )
        cutoff = meta["periods"][-1] if scope["period"] == "all" else scope["period"]
        available = [period for period in meta["periods"] if period <= cutoff]
        count = requested_months(query) or decision.lastMonths
        periods = (
            available[-count:]
            if count
            else available
            if scope["period"] == "all"
            else [scope["period"]]
        )
        if not periods:
            raise ValueError(
                "No source months are available for the requested research cutoff."
            )
        trend_periods = periods if count or scope["period"] == "all" else available[-6:]
        if count and len(periods) < count:
            warnings.append(
                "The requested history exceeds supplied source coverage; only available completed months are included."
            )
        phases.append(
            dict(
                agent="Research scope agent",
                status=scope_mode,
                durationMs=round((time.perf_counter() - stage) * 1000),
            )
        )
        emit("Research scope agent")
        stage = time.perf_counter()
        emit("SQL research agent", "running")
        data = collect(scope, focus, periods, trend_periods, tools)
        phases.append(
            dict(
                agent="SQL research tools",
                status="succeeded",
                durationMs=round((time.perf_counter() - stage) * 1000),
            )
        )
        emit("SQL research agent")
        offered = data["series"]
        facts = data["facts"]
        if not offered:
            facts.setdefault(
                "summary",
                "No source observations match the selected research scope. Missing observations do not establish a favorable or adverse outcome.",
            )
        requested = set(decision.series)
        allowed = {item["id"] for item in catalog_for(meta["id"])}
        requested &= allowed
        # The actual question determines mandatory evidence; a mistaken fraud scope cannot drop requested cashflows.
        if focus == "cashflow":
            requested.update(
                (
                    "transaction_volume",
                    "transaction_value",
                    "cash_in",
                    "cash_out",
                    "cash_net",
                    "cash_categories",
                )
            )
        if focus == "transactions":
            requested.update(("transaction_volume", "transaction_value"))
        if focus == "loans":
            requested &= {"loan_trend", "loan_type", "geography"}
            requested.update(("loan_trend", "loan_type"))
        if focus == "portfolio":
            requested.update(("transaction_volume", "loan_trend", "cash_net"))
        offered = [item for item in offered if item["id"] in requested] or offered
        emit("Research chart agent", "running")
        stage = time.perf_counter()
        rejection = None
        if offered:
            try:
                plan = provider.plan_research(
                    sanitize(query),
                    {
                        **scope,
                        "researchFocus": focus,
                        "reportingPeriods": periods,
                        "objectives": decision.objectives,
                    },
                    facts,
                    offered,
                )
                for value in [
                    plan.text,
                    *[item.body for item in plan.sections],
                    *[item.heading for item in plan.sections],
                    *[item.caption for item in plan.charts],
                ]:
                    validate_prose(value, facts)
                chart_ids = [item.series for item in plan.charts]
                if (
                    not chart_ids
                    or len(set(chart_ids)) != len(chart_ids)
                    or any(
                        item.series not in {row["id"] for row in offered}
                        or item.kind not in ALLOWED_KIND[item.series]
                        for item in plan.charts
                    )
                ):
                    raise ValueError(
                        "The chart agent selected unavailable or repeated series."
                    )
                if provider.external and (
                    len(plan.sections) < 5
                    or sum(len(item.body.split()) for item in plan.sections) < 450
                ):
                    raise ValueError(
                        "The model report was too short to qualify as a full research report."
                    )
                narrative_mode = "model" if provider.external else "local"
            except ValueError as error:
                rejection = str(error)[:200]
                plan = local_plan(facts, offered)
                narrative_mode = "fallback"
                warnings.append(
                    "Model analysis was unavailable, too brief or failed source validation. This is an explicitly labeled verified-data fallback; regenerate for a model-written report."
                )
        else:
            plan = local_plan(facts, offered)
            narrative_mode = "local"
        phases.append(
            dict(
                agent="Research analysis and chart agent",
                status=narrative_mode,
                validationIssue=rejection,
                durationMs=round((time.perf_counter() - stage) * 1000),
            )
        )
        text, charts = apply_plan(facts, offered, plan)
        emit("Research chart agent")
        emit("Research charts validated")
        sections = [
            dict(heading=section.heading, body=substitute(section.body, facts))
            for section in plan.sections
        ]
        period_text = periods[0] + " to " + periods[-1]
        scope_text = f"Research scope: {meta['name']} · {period_text} · {scope.get('region') or 'All regions'} · {focus} · {meta['currency']}."
        mode = (
            "model"
            if narrative_mode == "model"
            else "fallback"
            if provider.external
            else "local"
        )
        blocks = [
            dict(type="TEXT", text=scope_text),
            dict(type="TEXT", text="## Executive summary\n\n" + text),
        ]
        for section in sections[:3]:
            blocks.append(
                dict(
                    type="TEXT",
                    text="## " + section["heading"] + "\n\n" + section["body"],
                )
            )
        if data["metrics"]:
            blocks.append(dict(type="KPI", metrics=data["metrics"]))
        choices = {chart.series: chart for chart in plan.charts}
        for chart in charts:
            blocks.append(
                dict(
                    type="CHART",
                    title=chart["title"],
                    subtitle=chart["subtitle"],
                    kind=chart["kind"],
                    tone="research",
                    points=chart["points"],
                )
            )
            caption = choices.get(chart["id"])
            if caption and caption.caption:
                blocks.append(
                    dict(
                        type="TEXT",
                        text="### "
                        + chart["title"]
                        + " — interpretation\n\n"
                        + substitute(caption.caption, facts),
                    )
                )
        blocks.extend(
            dict(
                type="TABLE",
                title=table["title"],
                data=dict(columns=table["columns"], rows=table["rows"]),
            )
            for table in data["tables"]
        )
        for section in sections[3:]:
            blocks.append(
                dict(
                    type="TEXT",
                    text="## " + section["heading"] + "\n\n" + section["body"],
                )
            )
        evidence = [
            dict(
                id="RESEARCH-SQL-" + meta["version"][:12],
                title="Research source and SQL methodology",
                source=meta["name"],
                detail=f"Source version {meta['version']}. Reporting window {period_text}. Only allowlisted parameterized aggregate queries are executed; model output supplies no SQL or point values.",
                records=[
                    facts.get("transaction-method", ""),
                    facts.get("cashflow-method", ""),
                    *data["limitations"],
                ],
            )
        ]
        blocks.append(dict(type="EVIDENCE", evidence=evidence))
        response = dict(
            id=identifier("MSG"),
            question=sanitize(query),
            context=scope,
            timestamp=now(),
            title="Research brief",
            research=True,
            blocks=blocks,
            suggestions=[
                "Compare the last three months by region",
                "Research monthly transaction and cashflow patterns",
            ],
        )
        execution = dict(
            mode=mode,
            scopeMode=scope_mode,
            analysisMode=narrative_mode,
            configuredProvider=provider.name,
            model=getattr(provider, "model", None),
            calls=calls,
            phases=phases,
            tools=tools,
            warnings=warnings,
            durationMs=round((time.perf_counter() - started) * 1000),
            successfulModelCalls=sum(call["status"] == "succeeded" for call in calls),
            totalTokens=sum(call["totalTokens"] for call in calls),
        )
        response["analysis"] = analysis_metadata(scope, response["id"])
        response["analysis"].update(
            provider=provider.name,
            model=getattr(provider, "model", None),
            externalTransmission=bool(sent),
            outboundFields=sent,
            period=period_text,
            limitations=data["limitations"],
            researchExecution=execution,
        )
        response["researchReport"] = dict(
            version="research-report-v2",
            focus=focus,
            periods=periods,
            trendPeriods=trend_periods,
            objectives=decision.objectives,
            executiveSummary=text,
            sections=sections,
            execution=execution,
        )
        return response
    finally:
        provider_calls.reset(call_token)
        transmission_fields.reset(sent_token)


def render_pdf(response):
    from backend.features.research.pdf import render

    return render(response)


def load_brief(message_id):
    import json

    from backend.core.security import require
    from backend.features.workspaces.sessions import artifact_access

    require("read")
    if not re.fullmatch(r"MSG-[a-f0-9]{12}", message_id or ""):
        raise ValueError("Select a saved research answer.")
    artifact_access(message_id)
    with connect() as db:
        row = db.execute(
            "SELECT payload FROM artifacts WHERE id=? AND kind='analyst'", (message_id,)
        ).fetchone()
    if not row:
        raise ValueError("Saved research answer not found.")
    payload = json.loads(row["payload"])
    if not payload.get("research"):
        raise ValueError(
            "This answer is not a research brief. Ask a research question or turn on Research mode."
        )
    return payload
