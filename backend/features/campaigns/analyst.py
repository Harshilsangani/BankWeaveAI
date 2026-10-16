"""Bounded conversational entry into the same employee-report pipeline."""

import re
from datetime import date, timedelta

from backend.core.database import connect, metadata
from backend.core.identifiers import identifier, now
from backend.core.privacy import sanitize
from backend.core.security import actor, require
from backend.features.analytics.queries import analysis_metadata
from backend.features.analytics.scope import resolve
from backend.features.campaigns.data import digest, readiness
from backend.features.campaigns.jobs import create_campaign, enqueue
from backend.features.campaigns.rules import products_at


def is_campaign_question(query):
    return bool(
        re.search(
            r"\bcampaigns?\b|\bcredit[ -]?card\s+(?:offers?|prospects?)\b", query, re.I
        )
    ) and not bool(re.search(r"\bpolicy\b|\bpolicies\b|\bprocedure\b", query, re.I))


def answer(query, scope):
    from backend.core.progress import emit
    from backend.integrations.ai import LocalProvider, get_provider

    require("campaign_read")
    emit("Defining card campaign scope", "running")
    try:
        plan = get_provider().scope_card_campaign(query)
    except Exception:
        plan = LocalProvider().scope_card_campaign(query)
    meta = metadata(scope.get("datasetId", "meridian"))
    latest = date.fromisoformat(meta["periods"][-1] + "-01")
    next_month = (
        (latest.replace(day=28) + timedelta(days=4)).replace(day=1).strftime("%Y-%m")
    )
    period = plan.period or next_month
    dataset = meta["id"]
    base = resolve("", scope)
    base.pop("research", None)
    response = dict(
        id=identifier("MSG"),
        question=sanitize(query),
        title="Card campaign preparation",
        timestamp=now(),
        context=base,
        blocks=[],
        suggestions=["Prepare an October 2026 cashback card campaign report"],
    )
    response["analysis"] = analysis_metadata(base, response["id"])
    ready = readiness(dataset, period, actor().tenant)
    if not ready["ready"]:
        response["blocks"] = [dict(type="TEXT", text=ready["reason"])]
        emit("Campaign data coverage checked")
        return response
    with connect() as db:
        products = products_at(db, ready["cutoff"], actor().tenant)
    chosen = [
        product["id"]
        for product in products
        if plan.productKind == "all" or product["category"] == plan.productKind
    ]
    explicit_prepare = bool(
        re.search(r"\bprepare\b|\bcreate\b|\bgenerate\b|\bbuild\b|\brun\b", query, re.I)
    ) and not bool(re.search(r"\bhow\b|\bexplain\b|\bdo not\b|\bdon.t\b", query, re.I))
    response["blocks"].append(
        dict(
            type="TEXT",
            text=f"Campaign scope: {period} · Meridian synthetic cohort of {ready['batch']['cohortSize']:,} existing customers · Source cutoff {ready['cutoff']} · {plan.productKind} products. The published cohort spans all branches; chat region filters do not alter it.",
        )
    )
    if not chosen:
        response["blocks"].append(
            dict(
                type="TEXT",
                text="No reviewed product version matches this scope. Choose a product in Card Campaigns.",
            )
        )
        return response
    if not explicit_prepare:
        response["blocks"].append(
            dict(
                type="TEXT",
                text="Open Card Campaigns to review the products and choose Prepare employee report, or explicitly ask me to prepare the campaign report. No run has been started.",
            )
        )
        return response
    require("campaign_run")
    configuration = dict(
        datasetId=dataset,
        period=period,
        batchId=ready["batch"]["id"],
        productIds=sorted(chosen),
        sampleRewrites=0,
    )
    key = digest([actor().actor_id, sanitize(query), configuration])
    campaign = create_campaign(
        f"{period} {plan.productKind} card campaign", configuration, "chat-" + key
    )
    run = enqueue(
        campaign["id"], "chat-run-" + digest([campaign["id"], campaign["revision"]])
    )
    response["blocks"].append(
        dict(
            type="CAMPAIGN",
            campaignId=campaign["id"],
            runId=run["id"],
            title=campaign["title"],
            status=run["status"],
            **({"reportId": run["reportId"]} if run["reportId"] else {}),
        )
    )
    response["blocks"].append(
        dict(
            type="TEXT",
            text="The saved run will prepare prospects, grounded drafts and an employee report. Open its workspace to follow progress. No customer email is sent and no card is approved.",
        )
    )
    emit("Campaign report run accepted")
    return response
