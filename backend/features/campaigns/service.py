"""Actor-assigned card campaigns, employee reports and staff review."""

import json
import re
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, StrictBool

from backend.core.database import connect
from backend.core.identifiers import identifier, now
from backend.core.security import actor, require
from backend.features.campaigns.data import cutoff_for, digest, encode, readiness
from backend.features.campaigns.jobs import (
    campaign_payload,
    campaign_row,
    create_campaign,
    enqueue,
    has_access,
    run_payload,
)
from backend.features.campaigns.rules import contact_permission, products_at


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CampaignCreate(StrictInput):
    requestId: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    title: str = Field(min_length=3, max_length=120)
    datasetId: Literal["meridian", "bankshield"] = "meridian"
    period: str = Field(default="2026-10", pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")
    batchId: str = Field(min_length=8, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    productIds: list[str] = Field(default_factory=list, max_length=3)
    sampleRewrites: int = Field(default=0, ge=0, le=20)


class RunInput(StrictInput):
    requestId: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")


def get_readiness(
    datasetId: Literal["meridian", "bankshield"] = "meridian", period: str = "2026-10"
):
    identity = require("campaign_summary")
    return readiness(datasetId, period, identity.tenant)


def get_products(period: str = "2026-10"):
    identity = require("campaign_summary")
    with connect() as db:
        return products_at(db, cutoff_for(period), identity.tenant)


def add_campaign(body: CampaignCreate):
    require("campaign_run")
    data = readiness(body.datasetId, body.period, actor().tenant)
    if not data["ready"] or data["batch"]["id"] != body.batchId:
        raise ValueError(
            data["reason"]
            if not data["ready"]
            else "Choose the current validated input batch."
        )
    configuration = body.model_dump(exclude={"title", "requestId"})
    configuration["productIds"] = sorted(set(configuration["productIds"]))
    return create_campaign(body.title, configuration, body.requestId)


def list_campaigns():
    identity = require("campaign_summary")
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM card_campaigns WHERE tenant=? ORDER BY created_at DESC,id LIMIT 100",
            (identity.tenant,),
        ).fetchall()
        return [campaign_payload(row) for row in rows if has_access(row, identity)]


def get_campaign(campaign_id: str):
    require("campaign_summary")
    with connect() as db:
        row = campaign_row(db, campaign_id)
        runs = [
            run_payload(run)
            for run in db.execute(
                "SELECT * FROM campaign_runs WHERE campaign_id=? ORDER BY created_at DESC,id",
                (campaign_id,),
            )
        ]
        return {**campaign_payload(row), "runs": runs}


def start_run(campaign_id: str, body: RunInput):
    require("campaign_run")
    return enqueue(campaign_id, body.requestId)


def accessible_run(db, campaign_id, run_id):
    campaign_row(db, campaign_id)
    row = db.execute(
        "SELECT * FROM campaign_runs WHERE id=? AND campaign_id=?",
        (run_id, campaign_id),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Campaign run not found.")
    return row


def get_run(campaign_id: str, run_id: str):
    require("campaign_summary")
    with connect() as db:
        return run_payload(accessible_run(db, campaign_id, run_id))


def cancel_run(campaign_id: str, run_id: str):
    require("campaign_run")
    with connect() as db:
        row = accessible_run(db, campaign_id, run_id)
        if row["status"] not in ("ready", "failed", "cancelled"):
            db.execute(
                "UPDATE campaign_runs SET cancel_requested=1,status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,updated_at=? WHERE id=?",
                (now(), run_id),
            )
        return run_payload(
            db.execute("SELECT * FROM campaign_runs WHERE id=?", (run_id,)).fetchone()
        )


def get_candidates(
    campaign_id: str,
    run_id: str,
    status: Literal["all", "prospect", "no_match", "insufficient_data"] = "all",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
):
    require("campaign_read")
    with connect() as db:
        run = accessible_run(db, campaign_id, run_id)
        where = "c.run_id=?"
        args = [run_id]
        if status != "all":
            where += " AND c.status=?"
            args.append(status)
        total = db.execute(
            "SELECT COUNT(*) FROM campaign_candidates c WHERE " + where, args
        ).fetchone()[0]
        records = db.execute(
            """SELECT c.*,p.full_name,p.email,d.subject,d.body,d.provider,d.model,d.status draft_status
          FROM campaign_candidates c LEFT JOIN customer_profiles p ON p.id=c.customer_id AND p.dataset='meridian'
          LEFT JOIN campaign_drafts d ON d.run_id=c.run_id AND d.customer_id=c.customer_id WHERE """
            + where
            + " ORDER BY c.customer_id LIMIT ? OFFSET ?",
            [*args, limit, offset],
        ).fetchall()
        result = []
        for row in records:
            evidence = json.loads(row["evidence"])
            current, reason, current_consent = contact_permission(
                db,
                run["batch_id"],
                row["customer_id"],
                evidence["features"],
                tenant=actor().tenant,
            )
            draft_allowed = row["draft_status"] == "validated" and current == "allowed"
            result.append(
                dict(
                    customerId=row["customer_id"],
                    name=row["full_name"] or row["customer_id"],
                    email=row["email"] if current == "allowed" else None,
                    status=row["status"],
                    reasonCode=row["reason_code"],
                    productId=row["product_id"],
                    productVersion=row["product_version"],
                    contactStatus=row["contact_status"],
                    contactReason=row["contact_reason"],
                    currentContactStatus=current,
                    currentContactReason=reason,
                    evidence=evidence,
                    draft=dict(
                        subject=row["subject"],
                        body=row["body"],
                        provider=row["provider"],
                        model=row["model"],
                    )
                    if draft_allowed
                    else None,
                )
            )
        return dict(
            rows=result,
            total=total,
            offset=offset,
            nextOffset=offset + len(result) if offset + len(result) < total else None,
        )


def report_row(db, report_id):
    row = db.execute(
        "SELECT * FROM campaign_reports WHERE id=?", (report_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Employee campaign report not found.")
    if not has_access(row):
        raise PermissionError("This report is not assigned to your staff identity.")
    return row


def report_payload(row, details=False):
    result = json.loads(row["payload"])
    result.update(
        contentHash=row["content_hash"],
        reviewStatus=row["review_status"],
        reviewRevision=row["review_revision"],
        canReview="campaign_review"
        in __import__("backend.core.security", fromlist=["PERMISSIONS"]).PERMISSIONS[
            actor().role
        ],
    )
    if not details:
        result.pop("sampleDrafts", None)
        result.pop("source", None)
    return result


def list_reports():
    identity = require("campaign_summary")
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM campaign_reports WHERE tenant=? ORDER BY created_at DESC,id LIMIT 100",
            (identity.tenant,),
        ).fetchall()
        return [report_payload(row) for row in rows if has_access(row, identity)]


def get_report(report_id: str):
    identity = require("campaign_summary")
    from backend.core.security import PERMISSIONS

    with connect() as db:
        row = report_row(db, report_id)
        result = report_payload(row, "campaign_read" in PERMISSIONS[identity.role])
        result["canReadDetails"] = "campaign_read" in PERMISSIONS[identity.role]
        if result["canReadDetails"]:
            result["reviewEvents"] = [
                dict(item)
                for item in db.execute(
                    "SELECT * FROM campaign_review_events WHERE report_id=? ORDER BY created_at,id",
                    (report_id,),
                )
            ]
        return result


def download_report(report_id: str):
    identity = require("campaign_read")
    with connect() as db:
        report = report_row(db, report_id)
        row = db.execute(
            "SELECT * FROM report_files WHERE report_id=?", (report_id,)
        ).fetchone()
        if (
            not row
            or __import__("hashlib").sha256(row["html"].encode()).hexdigest()
            != report["content_hash"]
        ):
            raise ValueError("Saved campaign report checksum mismatch.")
        db.execute(
            "INSERT INTO report_downloads VALUES(?,?,?,?,?)",
            (
                identifier("DOWNLOAD"),
                report_id,
                identity.actor_id,
                row["sha256"],
                now(),
            ),
        )
    return Response(
        row["html"],
        media_type="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="{report_id}-card-campaign.html"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
            "ETag": f'"{row["sha256"]}"',
        },
    )


class ReviewInput(StrictInput):
    revision: int = Field(ge=1)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    decision: Literal["reviewed", "changes_requested", "rejected"]
    note: str = Field(min_length=5, max_length=1000)


def review_report(report_id: str, body: ReviewInput):
    identity = require("campaign_review")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = report_row(db, report_id)
        previous = db.execute(
            "SELECT * FROM campaign_review_events WHERE report_id=? AND revision=?",
            (report_id, body.revision),
        ).fetchone()
        if previous:
            if (
                previous["decision"] != body.decision
                or previous["content_hash"] != body.contentHash
                or previous["note"] != body.note.strip()
            ):
                raise HTTPException(
                    409,
                    "This report revision already has a different recorded decision.",
                )
            return report_payload(row, True)
        if (
            body.revision != row["review_revision"]
            or body.contentHash != row["content_hash"]
        ):
            raise HTTPException(
                409,
                "The report or review changed. Reload the exact version before deciding.",
            )
        db.execute(
            "INSERT INTO campaign_review_events VALUES(?,?,?,?,?,?,?,?)",
            (
                identifier("C-REVIEW"),
                report_id,
                body.revision,
                body.contentHash,
                body.decision,
                identity.actor_id,
                body.note.strip(),
                now(),
            ),
        )
        db.execute(
            "UPDATE campaign_reports SET review_status=?,review_revision=review_revision+1 WHERE id=?",
            (body.decision, report_id),
        )
        if body.decision == "changes_requested":
            campaign = db.execute(
                "SELECT campaign_id,campaign_revision FROM campaign_runs WHERE id=?",
                (row["run_id"],),
            ).fetchone()
            db.execute(
                "UPDATE card_campaigns SET revision=revision+1 WHERE id=? AND revision=?",
                (campaign["campaign_id"], campaign["campaign_revision"]),
            )
        return report_payload(
            db.execute(
                "SELECT * FROM campaign_reports WHERE id=?", (report_id,)
            ).fetchone(),
            True,
        )


def get_notifications():
    identity = require("read")
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM staff_notifications WHERE tenant=? AND recipient=? ORDER BY created_at DESC,id LIMIT 100",
            (identity.tenant, identity.actor_id),
        ).fetchall()
        return [
            dict(
                id=row["id"],
                reportId=row["report_id"],
                title=row["title"],
                readAt=row["read_at"],
                createdAt=row["created_at"],
            )
            for row in rows
        ]


def _notification_id(notification_id):
    if not re.fullmatch(r"NOTICE-[a-f0-9]{24}", notification_id):
        raise HTTPException(404, "Notification not found for this staff identity.")
    return notification_id


def mark_notification(notification_id: str):
    identity = require("read")
    _notification_id(notification_id)
    with connect() as db:
        row = db.execute(
            "SELECT * FROM staff_notifications WHERE id=? AND tenant=? AND recipient=?",
            (notification_id, identity.tenant, identity.actor_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Notification not found for this staff identity.")
        db.execute(
            "UPDATE staff_notifications SET read_at=COALESCE(read_at,?) WHERE id=?",
            (now(), notification_id),
        )
    return dict(id=notification_id, read=True)


def delete_notification(notification_id: str):
    identity = require("read")
    _notification_id(notification_id)
    with connect() as db:
        removed = db.execute(
            "DELETE FROM staff_notifications WHERE id=? AND tenant=? AND recipient=?",
            (notification_id, identity.tenant, identity.actor_id),
        ).rowcount
    if removed != 1:
        raise HTTPException(404, "Notification not found for this staff identity.")
    return dict(id=notification_id, removed=True)


def clear_notifications():
    identity = require("read")
    with connect() as db:
        removed = db.execute(
            "DELETE FROM staff_notifications WHERE tenant=? AND recipient=?",
            (identity.tenant, identity.actor_id),
        ).rowcount
    return dict(removed=removed)


class ScheduleInput(StrictInput):
    enabled: StrictBool
    revision: int = Field(ge=1)


def configure_schedule(campaign_id: str, body: ScheduleInput):
    require("campaign_admin")
    with connect() as db:
        row = campaign_row(db, campaign_id)
        if body.revision != row["revision"]:
            raise HTTPException(
                409,
                "Campaign configuration changed; reload it before changing its schedule.",
            )
        db.execute(
            "UPDATE card_campaigns SET schedule_enabled=? WHERE id=?",
            (int(body.enabled), campaign_id),
        )
        return campaign_payload(
            db.execute(
                "SELECT * FROM card_campaigns WHERE id=?", (campaign_id,)
            ).fetchone()
        )


class ConsentInput(StrictInput):
    customerId: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    action: Literal["granted", "withdrawn", "suppressed"]
    note: str = Field(min_length=5, max_length=500)


def record_consent(body: ConsentInput):
    identity = require("campaign_admin")
    day = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    with connect() as db:
        if not db.execute(
            "SELECT 1 FROM customers WHERE dataset='meridian' AND id=?",
            (body.customerId,),
        ).fetchone():
            raise ValueError("Select an existing Meridian customer.")
        event_id = identifier("CONSENT")
        db.execute(
            "INSERT INTO marketing_consent_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                event_id,
                identity.tenant,
                "meridian",
                body.customerId,
                None,
                "email",
                "credit_card_offers",
                body.action,
                day,
                day,
                "Explicit staff-recorded demo preference: " + body.note,
                identity.actor_id,
                now(),
            ),
        )
    return dict(id=event_id, action=body.action, effectiveOn=day)


class ProductRules(StrictInput):
    minScore: int | None = Field(default=None, ge=300, le=900)
    minIncomeMinor: int = Field(ge=0, le=1000000000)
    maxDebtRatioBps: int = Field(ge=0, le=10000)
    minCategoryShareBps: int = Field(ge=0, le=10000)
    category: Literal["Travel", "Shopping", "All"]
    collateralMinor: int = Field(default=0, ge=0, le=1000000000)


class ProductInput(StrictInput):
    id: str = Field(min_length=3, max_length=80, pattern=r"^[A-Z0-9-]+$")
    version: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9-]+$")
    name: str = Field(min_length=3, max_length=120)
    category: Literal["travel", "cashback", "entry"]
    effectiveOn: str = Field(pattern=r"^20\d{2}-(0[1-9]|1[0-2])-\d{2}$")
    annualFeeMinor: int = Field(ge=0, le=10000000)
    feeConditions: str = Field(min_length=5, max_length=500)
    benefits: dict[str, str]
    rules: ProductRules


def add_product(body: ProductInput):
    from datetime import date

    identity = require("campaign_admin")
    date.fromisoformat(body.effectiveOn)
    if not 1 <= len(body.benefits) <= 4 or any(
        not re.fullmatch(r"[a-z_]{3,40}", key) or not 3 <= len(value) <= 400
        for key, value in body.benefits.items()
    ):
        raise ValueError("Supply one through four bounded benefit references.")
    product = dict(
        id=body.id,
        version=body.version,
        name=body.name,
        category=body.category,
        currency="INR",
        annualFeeMinor=body.annualFeeMinor,
        feeConditions=body.feeConditions,
        benefits=body.benefits,
        rules=body.rules.model_dump(),
        rulesVersion="demo-" + body.version,
        effectiveOn=body.effectiveOn,
        publishedAt=now(),
        disclosure="Fictional demonstration offer. Subject to separate application, bank checks and customer consent. This is not a pre-approved card.",
    )
    with connect() as db:
        prior = db.execute(
            "SELECT * FROM card_product_versions WHERE product_id=? AND version=?",
            (body.id, body.version),
        ).fetchone()
        if prior:
            product["publishedAt"] = json.loads(prior["catalog"]).get(
                "publishedAt", product["publishedAt"]
            )
            if prior["tenant"] != identity.tenant or prior["content_hash"] != digest(
                product
            ):
                raise HTTPException(
                    409,
                    "This immutable product version already exists with different content.",
                )
        else:
            db.execute(
                "INSERT INTO card_product_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (
                    body.id,
                    body.version,
                    identity.tenant,
                    body.name,
                    body.category,
                    body.effectiveOn,
                    None,
                    encode(product),
                    encode(product["rules"]),
                    "active",
                    digest(product),
                ),
            )
    return product
