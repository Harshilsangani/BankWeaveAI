"""Durable card-campaign jobs, drafts, immutable reports and staff publication."""

import hashlib
import json
import re
import threading
import uuid
from datetime import datetime, timedelta, timezone
from html import escape

from fastapi import HTTPException

from backend.core.database import connect
from backend.core.identifiers import now
from backend.core.security import actor, require
from backend.features.campaigns.data import (
    RULES_VERSION,
    TEMPLATE_VERSION,
    TENANT,
    cutoff_for,
    digest,
    encode,
)
from backend.features.campaigns.rules import (
    build_features,
    contact_permission,
    match_run,
    products_at,
    validate_batch,
)

STAGES = ("validating", "building_features", "matching", "drafting", "reporting")
PLACEHOLDERS = {
    "product_name",
    "display_name",
    "reason",
    "benefits",
    "fee",
    "conditions",
    "disclosure",
}


def has_access(row, identity=None):
    identity = identity or actor()
    recipients = json.loads(row["recipients"])
    return row["tenant"] == identity.tenant and (
        identity.role == "admin"
        or row["owner"] == identity.actor_id
        or identity.actor_id in recipients
    )


def campaign_row(db, campaign_id):
    row = db.execute(
        "SELECT * FROM card_campaigns WHERE id=?", (campaign_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Card campaign not found.")
    if not has_access(row):
        raise PermissionError(
            "This card campaign is not assigned to your staff identity."
        )
    return row


def create_campaign(title, configuration, request_id):
    identity = require("campaign_run")
    recipients = [identity.actor_id]
    if identity.adapter == "development" and "local-admin" not in recipients:
        recipients.append("local-admin")
    campaign_id = (
        "CAMPAIGN-" + digest([identity.tenant, identity.actor_id, request_id])[:24]
    )
    with connect() as db:
        existing = db.execute(
            "SELECT * FROM card_campaigns WHERE id=?", (campaign_id,)
        ).fetchone()
        if existing:
            if (
                existing["configuration"] != encode(configuration)
                or existing["title"] != title
            ):
                raise HTTPException(
                    409, "Campaign request ID already belongs to different inputs."
                )
            return campaign_payload(existing)
        db.execute(
            "INSERT INTO card_campaigns(id,tenant,owner,title,configuration,recipients,created_at) VALUES(?,?,?,?,?,?,?)",
            (
                campaign_id,
                identity.tenant,
                identity.actor_id,
                title,
                encode(configuration),
                encode(recipients),
                now(),
            ),
        )
        return campaign_payload(
            db.execute(
                "SELECT * FROM card_campaigns WHERE id=?", (campaign_id,)
            ).fetchone()
        )


def campaign_payload(row):
    return dict(
        id=row["id"],
        title=row["title"],
        revision=row["revision"],
        owner=row["owner"],
        recipients=json.loads(row["recipients"]),
        configuration=json.loads(row["configuration"]),
        createdAt=row["created_at"],
        scheduleEnabled=bool(row["schedule_enabled"]),
        scheduleTimezone=row["schedule_timezone"],
    )


def enqueue(campaign_id, request_id, scheduled=False, identity=None):
    identity = identity or require("campaign_run")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        campaign = db.execute(
            "SELECT * FROM card_campaigns WHERE id=?", (campaign_id,)
        ).fetchone()
        if not campaign:
            raise HTTPException(404, "Card campaign not found.")
        if campaign["tenant"] != identity.tenant or (
            not scheduled and not has_access(campaign, identity)
        ):
            raise PermissionError(
                "This campaign is not accessible to the run requester."
            )
        config = json.loads(campaign["configuration"])
        fingerprint = digest([campaign_id, campaign["revision"], config])
        replay = db.execute(
            "SELECT * FROM campaign_runs WHERE tenant=? AND owner=? AND request_id=?",
            (identity.tenant, identity.actor_id, request_id),
        ).fetchone()
        if replay:
            if replay["fingerprint"] != fingerprint:
                raise HTTPException(
                    409, "Run request ID already belongs to different inputs."
                )
            return run_payload(replay)
        natural = db.execute(
            "SELECT * FROM campaign_runs WHERE campaign_id=? AND campaign_revision=? AND period=?",
            (campaign_id, campaign["revision"], config["period"]),
        ).fetchone()
        if natural:
            return run_payload(natural)
        batch, profiles = validate_batch(db, config["batchId"])
        if (
            batch["tenant"] != identity.tenant
            or batch["dataset"] != config["datasetId"]
            or batch["cutoff"] != cutoff_for(config["period"])
        ):
            raise ValueError(
                "The input batch does not cover this campaign tenant, dataset and cutoff."
            )
        products = products_at(db, batch["cutoff"], identity.tenant)
        if config["productIds"]:
            products = [
                product for product in products if product["id"] in config["productIds"]
            ]
            if {product["id"] for product in products} != set(config["productIds"]):
                raise ValueError(
                    "A selected product version is unavailable for the cutoff."
                )
        if not products:
            raise ValueError("No reviewed demo product version is available.")
        if len(products) > 3:
            raise ValueError(
                "Choose up to three products for one bounded campaign run."
            )
        specification = dict(
            tenant=identity.tenant,
            batchId=batch["id"],
            batchHash=batch["manifest_hash"],
            period=config["period"],
            cutoff=batch["cutoff"],
            windowStart=batch["window_start"],
            cohortSize=batch["cohort_size"],
            products=products,
            rulesVersion=RULES_VERSION,
            sampleRewrites=config.get("sampleRewrites", 0),
            maxModelCalls=min(23, len(products) + config.get("sampleRewrites", 0)),
            recipients=json.loads(campaign["recipients"]),
            campaignTitle=campaign["title"],
            campaignRevision=campaign["revision"],
        )
        run_id = (
            "CRUN-" + digest([campaign_id, campaign["revision"], config["period"]])[:24]
        )
        timestamp = now()
        db.execute(
            """INSERT INTO campaign_runs(id,campaign_id,tenant,owner,request_id,fingerprint,campaign_revision,period,batch_id,specification,status,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                run_id,
                campaign_id,
                identity.tenant,
                identity.actor_id,
                request_id,
                fingerprint,
                campaign["revision"],
                config["period"],
                batch["id"],
                encode(specification),
                "queued",
                timestamp,
                timestamp,
            ),
        )
        return run_payload(
            db.execute("SELECT * FROM campaign_runs WHERE id=?", (run_id,)).fetchone()
        )


def run_payload(row):
    checkpoint = json.loads(row["checkpoint"])
    return dict(
        id=row["id"],
        campaignId=row["campaign_id"],
        campaignRevision=row["campaign_revision"],
        period=row["period"],
        batchId=row["batch_id"],
        status=row["status"],
        stage=row["status"],
        attempt=row["attempt"],
        counts=checkpoint.get("counts"),
        modelCalls=checkpoint.get("modelCalls", 0),
        warning=row["warning"],
        error=row["error"],
        reportId=row["report_id"],
        cancelRequested=bool(row["cancel_requested"]),
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def counts_for(db, run_id):
    counts = dict(
        selected=0,
        analyzed=0,
        insufficientData=0,
        prospects=0,
        noMatch=0,
        contactable=0,
        suppressed=0,
        drafts=0,
        emailsSent=0,
    )
    for row in db.execute(
        "SELECT status,contact_status,COUNT(*) total FROM campaign_candidates WHERE run_id=? GROUP BY status,contact_status",
        (run_id,),
    ):
        n = row["total"]
        counts["selected"] += n
        if row["status"] == "insufficient_data":
            counts["insufficientData"] += n
        else:
            counts["analyzed"] += n
        if row["status"] == "no_match":
            counts["noMatch"] += n
        elif row["status"] == "prospect":
            counts["prospects"] += n
            counts[
                "contactable" if row["contact_status"] == "allowed" else "suppressed"
            ] += n
    counts["drafts"] = db.execute(
        "SELECT COUNT(*) FROM campaign_drafts WHERE run_id=? AND status='validated'",
        (run_id,),
    ).fetchone()[0]
    if (
        counts["selected"] != counts["analyzed"] + counts["insufficientData"]
        or counts["analyzed"] != counts["prospects"] + counts["noMatch"]
        or counts["prospects"] != counts["contactable"] + counts["suppressed"]
    ):
        raise ValueError("Campaign counts do not reconcile.")
    return counts


class LeaseLost(Exception):
    pass


class RunCancelled(Exception):
    pass


def claim(worker):
    timestamp = now()
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT * FROM campaign_runs WHERE status='queued' OR (status IN ('validating','building_features','matching','drafting','reporting') AND (lease_until IS NULL OR lease_until<?)) ORDER BY created_at,id LIMIT 1",
            (timestamp,),
        ).fetchone()
        if not row:
            return None
        token = worker + ":" + uuid.uuid4().hex
        expiry = (datetime.now(timezone.utc) + timedelta(seconds=90)).isoformat()
        db.execute(
            "UPDATE campaign_runs SET lease_owner=?,lease_until=?,heartbeat_at=?,attempt=attempt+1,status=CASE WHEN status='queued' THEN 'validating' ELSE status END,updated_at=? WHERE id=?",
            (token, expiry, timestamp, timestamp, row["id"]),
        )
        return row["id"], token


def save_checkpoint(run_id, token, checkpoint, stage=None):
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM campaign_runs WHERE id=?", (run_id,)).fetchone()
        if row["lease_owner"] != token:
            raise LeaseLost()
        if row["cancel_requested"]:
            raise RunCancelled()
        expiry = (datetime.now(timezone.utc) + timedelta(seconds=90)).isoformat()
        db.execute(
            "UPDATE campaign_runs SET checkpoint=?,status=?,lease_until=?,heartbeat_at=?,updated_at=? WHERE id=? AND lease_owner=?",
            (
                encode(checkpoint),
                stage or row["status"],
                expiry,
                now(),
                now(),
                run_id,
                token,
            ),
        )


def validate_template(template, product):
    from backend.integrations.ai import CardOutreachTemplate

    value = CardOutreachTemplate.model_validate(template)
    if set(value.benefits) - product["benefits"].keys():
        raise ValueError("The draft selected an unknown product benefit.")
    if len(value.benefits) != len(set(value.benefits)):
        raise ValueError("The draft repeats a benefit.")
    body_fields = set(re.findall(r"\{([^{}]+)\}", value.body))
    subject_fields = set(re.findall(r"\{([^{}]+)\}", value.subject))
    if body_fields != PLACEHOLDERS or subject_fields != {"product_name"}:
        raise ValueError("The draft is missing approved disclosure placeholders.")
    prose = re.sub(r"\{[^{}]+\}", "", " ".join((value.subject, value.body)))
    if re.search(
        r"[\d{}]|https?://|\bpre.?approv|\bguarantee|\bfree\b|\bwaived\b|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million)\b",
        prose,
        re.I,
    ):
        raise ValueError(
            "The draft contains an unsupported quantitative or approval claim."
        )
    return value.model_dump()


def render_draft(template, product, feature):
    values = dict(
        product_name=product["name"],
        display_name=feature.get("displayName", "Customer"),
        reason=f"Recorded synthetic {product['category']} activity matches this product's demo benefits. Staff must verify suitability.",
        benefits="\n".join(
            product["benefits"][reference] for reference in template["benefits"]
        ),
        fee=f"INR {product['annualFeeMinor'] / 100:,.2f}",
        conditions=product["feeConditions"],
        disclosure=product["disclosure"],
    )
    replace = lambda text: re.sub(r"\{([^{}]+)\}", lambda match: values[match[1]], text)
    return replace(template["subject"]), replace(template["body"])


def prepare_drafts(run_id, token, specification, checkpoint):
    from backend.integrations.ai import (
        LocalProvider,
        get_provider,
        provider_usage,
        transmission_fields,
    )

    templates = checkpoint.setdefault("templates", {})
    samples = checkpoint.setdefault("samples", {})
    products = {product["id"]: product for product in specification["products"]}
    with connect() as db:
        candidates = [
            dict(row)
            for row in db.execute(
                "SELECT * FROM campaign_candidates WHERE run_id=? AND status='prospect' AND contact_status='allowed' ORDER BY customer_id",
                (run_id,),
            )
        ]
    checkpoint.setdefault("modelCalls", 0)
    checkpoint.setdefault("warnings", [])
    try:
        provider = get_provider()
    except Exception:
        provider = LocalProvider()
        checkpoint["warnings"].append(
            "AI provider unavailable; labeled local templates were used."
        )

    def make_template(product, reason=""):
        if not provider.external:
            return dict(
                template=validate_template(
                    LocalProvider().draft_card_template(product), product
                ),
                provider="local",
                model=None,
            )
        if checkpoint["modelCalls"] >= specification["maxModelCalls"]:
            checkpoint["warnings"].append(
                "Model call budget reached; labeled local templates completed the remaining drafts."
            )
            return dict(
                template=validate_template(
                    LocalProvider().draft_card_template(product), product
                ),
                provider="local",
                model=None,
            )
        # Persist budget consumption before the model call so a process crash cannot reset the budget.
        checkpoint["modelCalls"] += 1
        save_checkpoint(run_id, token, checkpoint, "drafting")
        sent = []
        usage = []
        trace_token = transmission_fields.set(sent)
        usage_token = provider_usage.set(usage)
        try:
            value = validate_template(
                provider.draft_card_template(product, reason), product
            )
            return dict(
                template=value,
                provider=provider.name,
                model=getattr(provider, "model", None),
            )
        except Exception:
            checkpoint["warnings"].append(
                "An AI draft failed validation or was unavailable; a labeled local template was used."
            )
            return dict(
                template=validate_template(
                    LocalProvider().draft_card_template(product), product
                ),
                provider="local",
                model=None,
            )
        finally:
            transmission_fields.reset(trace_token)
            provider_usage.reset(usage_token)
            checkpoint["outboundFields"] = sorted(
                set(checkpoint.get("outboundFields", []) + sent)
            )
            checkpoint["modelTokens"] = checkpoint.get("modelTokens", 0) + sum(
                item["totalTokens"] for item in usage
            )

    for product_id in sorted({row["product_id"] for row in candidates}):
        if product_id not in templates:
            templates[product_id] = make_template(products[product_id])
            save_checkpoint(run_id, token, checkpoint, "drafting")
    for candidate in candidates[: specification["sampleRewrites"]]:
        if candidate["customer_id"] not in samples:
            samples[candidate["customer_id"]] = make_template(
                products[candidate["product_id"]],
                f"Anonymous {products[candidate['product_id']]['category']} product-fit sample; no personal or credit details supplied.",
            )
            save_checkpoint(run_id, token, checkpoint, "drafting")
    rows = []
    for candidate in candidates:
        selected = samples.get(
            candidate["customer_id"], templates[candidate["product_id"]]
        )
        evidence = json.loads(candidate["evidence"])
        subject, body = render_draft(
            selected["template"],
            products[candidate["product_id"]],
            evidence["features"],
        )
        rows.append(
            (
                run_id,
                candidate["customer_id"],
                subject,
                body,
                TEMPLATE_VERSION,
                selected["provider"],
                selected["model"],
                digest([subject, body]),
                "validated",
            )
        )
    with connect() as db:
        db.executemany(
            "INSERT OR IGNORE INTO campaign_drafts VALUES(?,?,?,?,?,?,?,?,?)", rows
        )
    save_checkpoint(run_id, token, checkpoint, "reporting")


def render_report(report):
    from backend.features.reports.html import REPORT_STYLES

    def text(value):
        return escape(str(value), quote=True)

    counts = report["counts"]
    parts = [
        f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>{text(report['title'])}</title><style>{REPORT_STYLES}</style></head><body>",
        "<small>BANKWEAVE AI / CARD CAMPAIGN REPORT / SYNTHETIC DATA</small>",
        f"<h1>{text(report['title'])}</h1><p>{text(report['period'])} campaign · Cutoff {text(report['cutoff'])} · {text(report['windowStart'])} to {text(report['cutoff'])}</p>",
        f"<p>Report {text(report['id'])} · Run {text(report['runId'])} · Revision {report['campaignRevision']}</p>",
        '<h2>Executive summary</h2><div class="metrics">',
    ]
    for key, label in [
        ("selected", "Customers selected"),
        ("prospects", "Potential prospects"),
        ("contactable", "Contactable prospects"),
        ("drafts", "Drafts prepared"),
        ("insufficientData", "Insufficient data"),
        ("emailsSent", "Customer emails sent"),
    ]:
        parts.append(f"<div>{label}<b>{counts[key]:,}</b></div>")
    parts.append(
        "</div><p>Potential prospects require employee review. No credit card is approved and no customer email is sent.</p><h2>Product distribution</h2>"
    )
    for item in report["products"]:
        parts.append(
            f"<p>{text(item['name'])}: {item['prospects']} prospects, {item['drafts']} available drafts. Annual fee INR {item['annualFeeMinor'] / 100:,.2f}. {text(item['feeConditions'])}</p>"
        )
    parts.append("<h2>Screening and contact exclusions</h2><ul>")
    for item in report["exclusions"]:
        parts.append(f"<li>{text(item['reason'])}: {item['count']}</li>")
    parts.append("</ul><h2>Draft examples for staff review</h2>")
    for draft in report["sampleDrafts"]:
        parts.append(
            f"<h3>{text(draft['customerId'])} · {text(draft['subject'])}</h3><pre>{text(draft['body'])}</pre><small>{text(draft['provider'])} · {text(draft['templateVersion'])}</small>"
        )
    parts.append("<h2>Source versions and limitations</h2><ul>")
    for note in report["limitations"] + report.get("warnings", []):
        parts.append("<li>" + text(note) + "</li>")
    parts.append("</ul><pre>" + text(encode(report["source"])) + "</pre></body></html>")
    return "".join(parts)


def publish(run_id, token, specification, checkpoint):
    timestamp = now()
    report_id = "CREPORT-" + digest(run_id)[:24]
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        run = db.execute("SELECT * FROM campaign_runs WHERE id=?", (run_id,)).fetchone()
        if run["lease_owner"] != token:
            raise LeaseLost()
        if run["cancel_requested"]:
            raise RunCancelled()
        for candidate in db.execute(
            "SELECT * FROM campaign_candidates WHERE run_id=? AND status='prospect'",
            (run_id,),
        ).fetchall():
            evidence = json.loads(candidate["evidence"])
            status, reason, event = contact_permission(
                db,
                specification["batchId"],
                candidate["customer_id"],
                evidence["features"],
                tenant=specification["tenant"],
            )
            evidence["finalConsent"] = event
            db.execute(
                "UPDATE campaign_candidates SET evidence=? WHERE run_id=? AND customer_id=?",
                (encode(evidence), run_id, candidate["customer_id"]),
            )
            # A final withdrawal can suppress an existing draft, but a new grant does not invent a missing draft.
            if status != "allowed":
                db.execute(
                    "UPDATE campaign_candidates SET contact_status=?,contact_reason=? WHERE run_id=? AND customer_id=?",
                    (status, reason, run_id, candidate["customer_id"]),
                )
                db.execute(
                    "UPDATE campaign_drafts SET status='suppressed' WHERE run_id=? AND customer_id=?",
                    (run_id, candidate["customer_id"]),
                )
        counts = counts_for(db, run_id)
        if (
            counts["selected"] != specification["cohortSize"]
            or counts["drafts"] != counts["contactable"]
        ):
            raise ValueError(
                "The campaign report cannot publish incomplete candidate/draft results."
            )
        product_counts = []
        for product in specification["products"]:
            prospective = db.execute(
                "SELECT COUNT(*) FROM campaign_candidates WHERE run_id=? AND product_id=? AND status='prospect'",
                (run_id, product["id"]),
            ).fetchone()[0]
            drafts = db.execute(
                "SELECT COUNT(*) FROM campaign_candidates c JOIN campaign_drafts d ON d.run_id=c.run_id AND d.customer_id=c.customer_id WHERE c.run_id=? AND c.product_id=? AND d.status='validated'",
                (run_id, product["id"]),
            ).fetchone()[0]
            product_counts.append(
                dict(
                    id=product["id"],
                    name=product["name"],
                    version=product["version"],
                    prospects=prospective,
                    drafts=drafts,
                    annualFeeMinor=product["annualFeeMinor"],
                    feeConditions=product["feeConditions"],
                )
            )
        exclusions = [
            dict(reason=row["reason_code"], count=row["total"])
            for row in db.execute(
                "SELECT reason_code,COUNT(*) total FROM campaign_candidates WHERE run_id=? AND status!='prospect' GROUP BY reason_code ORDER BY total DESC",
                (run_id,),
            )
        ]
        exclusions += [
            dict(reason=row["contact_reason"], count=row["total"])
            for row in db.execute(
                "SELECT contact_reason,COUNT(*) total FROM campaign_candidates WHERE run_id=? AND status='prospect' AND contact_status='suppressed' GROUP BY contact_reason ORDER BY total DESC",
                (run_id,),
            )
        ]
        samples = [
            dict(
                customerId=row["customer_id"],
                subject=row["subject"],
                body=row["body"],
                provider=row["provider"],
                model=row["model"],
                templateVersion=row["template_version"],
            )
            for row in db.execute(
                "SELECT * FROM campaign_drafts WHERE run_id=? AND status='validated' ORDER BY customer_id LIMIT 6",
                (run_id,),
            )
        ]
        providers = [
            dict(provider=row["provider"], model=row["model"], count=row["total"])
            for row in db.execute(
                "SELECT provider,model,COUNT(*) total FROM campaign_drafts WHERE run_id=? AND status='validated' GROUP BY provider,model",
                (run_id,),
            )
        ]
        manifest = json.loads(
            db.execute(
                "SELECT manifest FROM campaign_input_batches WHERE id=?",
                (specification["batchId"],),
            ).fetchone()[0]
        )
        report = dict(
            id=report_id,
            kind="card_campaign",
            runId=run_id,
            campaignId=run["campaign_id"],
            title=specification["campaignTitle"],
            period=specification["period"],
            cutoff=specification["cutoff"],
            windowStart=specification["windowStart"],
            campaignRevision=specification["campaignRevision"],
            createdAt=timestamp,
            counts=counts,
            products=product_counts,
            exclusions=exclusions,
            sampleDrafts=samples,
            providers=providers,
            modelCalls=checkpoint.get("modelCalls", 0),
            warnings=sorted(set(checkpoint.get("warnings", []))),
            modelTokens=checkpoint.get("modelTokens", 0),
            source=dict(
                batchId=specification["batchId"],
                batchHash=specification["batchHash"],
                rulesVersion=specification["rulesVersion"],
                templateVersion=TEMPLATE_VERSION,
                reusedPeriods=manifest["reusedPeriods"],
                generatedPeriods=manifest["generatedPeriods"],
                outboundFields=checkpoint.get("outboundFields", []),
                productHashes={
                    product["id"]: product["contentHash"]
                    for product in specification["products"]
                },
            ),
            limitations=[
                "All customer observations, credit profiles, permissions and products are synthetic demonstration data.",
                "Potential prospects are not credit approvals or pre-approved offers. Employee review does not authorize sending or issuance.",
                "Interest/outside obligations and the preceding history are explicitly generated extensions, not verified lending evidence.",
                "The complete cohort is screened deterministically. AI drafts only bounded templates and optional anonymous samples.",
                "Customer emails sent: zero. Final consent withdrawals are rechecked before report publication.",
            ],
        )
        html = render_report(report)
        html_hash = hashlib.sha256(html.encode()).hexdigest()
        db.execute(
            "INSERT OR IGNORE INTO campaign_reports(id,run_id,tenant,owner,recipients,payload,content_hash,created_at) VALUES(?,?,?,?,?,?,?,?)",
            (
                report_id,
                run_id,
                run["tenant"],
                run["owner"],
                encode(specification["recipients"]),
                encode(report),
                html_hash,
                timestamp,
            ),
        )
        db.execute(
            "INSERT OR IGNORE INTO report_files VALUES(?,?,?,?)",
            (report_id, html, html_hash, timestamp),
        )
        db.execute(
            "INSERT OR IGNORE INTO artifacts VALUES(?,?,?,?)",
            (report_id, "card_campaign_report", encode(report), timestamp),
        )
        for recipient in specification["recipients"]:
            notification_id = (
                "NOTICE-" + digest([report_id, recipient, "campaign_ready"])[:24]
            )
            db.execute(
                "INSERT OR IGNORE INTO staff_notifications(id,tenant,recipient,report_id,type,title,created_at) VALUES(?,?,?,?,?,?,?)",
                (
                    notification_id,
                    run["tenant"],
                    recipient,
                    report_id,
                    "campaign_ready",
                    f"{specification['period']} card campaign report is ready",
                    timestamp,
                ),
            )
        checkpoint["counts"] = counts
        db.execute(
            "UPDATE campaign_runs SET status='ready',checkpoint=?,report_id=?,warning=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_owner=?",
            (
                encode(checkpoint),
                report_id,
                " ".join(report["warnings"]) or None,
                timestamp,
                run_id,
                token,
            ),
        )
    return report_id


def execute_claim(run_id, token):
    stop = threading.Event()

    def heartbeat():
        while not stop.wait(15):
            with connect() as db:
                expiry = (
                    datetime.now(timezone.utc) + timedelta(seconds=90)
                ).isoformat()
                db.execute(
                    "UPDATE campaign_runs SET lease_until=?,heartbeat_at=? WHERE id=? AND lease_owner=?",
                    (expiry, now(), run_id, token),
                )

    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        with connect() as db:
            run = dict(
                db.execute(
                    "SELECT * FROM campaign_runs WHERE id=?", (run_id,)
                ).fetchone()
            )
        specification = json.loads(run["specification"])
        checkpoint = json.loads(run["checkpoint"])
        save_checkpoint(run_id, token, checkpoint, "validating")
        with connect() as db:
            batch, _ = validate_batch(db, specification["batchId"])
            if batch["manifest_hash"] != specification["batchHash"]:
                raise ValueError("Accepted input batch version changed.")
        if not checkpoint.get("featuresComplete"):
            save_checkpoint(run_id, token, checkpoint, "building_features")
            checkpoint["featuresComplete"] = build_features(specification["batchId"])
            save_checkpoint(run_id, token, checkpoint, "matching")
        if not checkpoint.get("matchingComplete"):
            checkpoint["matchingComplete"] = match_run(run_id, specification)
            save_checkpoint(run_id, token, checkpoint, "drafting")
        prepare_drafts(run_id, token, specification, checkpoint)
        publish(run_id, token, specification, checkpoint)
    except LeaseLost:
        pass
    except Exception as error:
        status = "cancelled" if isinstance(error, RunCancelled) else "failed"
        message = (
            str(error)
            if isinstance(error, ValueError)
            else "The campaign could not finish. Check the worker and start a revised run after resolving the issue."
        )
        with connect() as db:
            db.execute(
                "UPDATE campaign_runs SET status=?,error=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_owner=?",
                (status, message[:500], now(), run_id, token),
            )
    finally:
        stop.set()
        thread.join(timeout=2)


def work_once(worker=None):
    from backend.core.security import Identity, current_identity

    identity_token = current_identity.set(
        Identity("system-card-campaign-runner", "campaign_worker", TENANT, "internal")
    )
    try:
        require("campaign_run")
        work = claim(worker or "worker-" + uuid.uuid4().hex)
        if not work:
            return False
        execute_claim(*work)
        return True
    finally:
        current_identity.reset(identity_token)
