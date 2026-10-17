"""Explicit Admin test delivery of a reviewed saved draft to one configured inbox."""

import json
import os
from datetime import datetime, timezone

from fastapi import HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StrictBool

from backend.core.database import connect
from backend.core.identifiers import identifier, now
from backend.core.security import require
from backend.features.campaigns.data import digest
from backend.features.campaigns.rules import contact_permission
from backend.integrations.email import MailError, message, send_mail, settings


class TestEmailInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customerId: str = Field(min_length=1, max_length=80)
    revision: int = Field(ge=1)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    retry: StrictBool = False
    presentationHash: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


def receipt(row):
    status, error = row["status"], row["error"]
    if (
        status == "sending"
        and (
            datetime.now(timezone.utc) - datetime.fromisoformat(row["updated_at"])
        ).total_seconds()
        > 120
    ):
        status = "unknown"
        error = "Submission was interrupted. Check the recipient inbox; automatic resend is blocked."
    return dict(
        id=row["id"],
        customerId=row["customer_id"],
        recipient=row["recipient"],
        sender=row["sender"],
        subject=row["subject"],
        status=status,
        messageId=row["message_id"],
        attempt=row["attempt"],
        error=error,
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        presentationHash=row["draft_hash"],
        presentationVersion=row["presentation_version"],
    )


def overview(db, report):
    try:
        config = settings()
        enabled, reason, recipient = True, "", config.recipient
        used = db.execute(
            "SELECT COALESCE(SUM(attempt),0) FROM campaign_email_deliveries WHERE tenant=? AND updated_at>=?",
            (report["tenant"], now()[:10]),
        ).fetchone()[0]
        remaining = max(0, config.daily_limit - used)
    except ValueError as error:
        enabled, reason, recipient, remaining = False, str(error), None, 0
    history = [
        receipt(row)
        for row in db.execute(
            "SELECT * FROM campaign_email_deliveries WHERE report_id=? ORDER BY created_at DESC,id LIMIT 100",
            (report["id"],),
        )
    ]
    return dict(
        enabled=enabled,
        reason=reason,
        recipient=recipient,
        remaining=remaining,
        reviewed=report["review_status"] == "reviewed",
        history=history,
    )


def get_deliveries(report_id: str):
    require("campaign_review")
    from backend.features.campaigns.service import report_row

    with connect() as db:
        return overview(db, report_row(db, report_id))


def validated_candidate(db, report, customer_id):
    candidate = db.execute(
        "SELECT c.*,d.subject,d.body,d.content_hash,d.status draft_status,r.batch_id,r.status run_status "
        "FROM campaign_candidates c JOIN campaign_drafts d ON d.run_id=c.run_id AND d.customer_id=c.customer_id "
        "JOIN campaign_runs r ON r.id=c.run_id WHERE c.run_id=? AND c.customer_id=?",
        (report["run_id"], customer_id),
    ).fetchone()
    if (
        not candidate
        or candidate["status"] != "prospect"
        or candidate["draft_status"] != "validated"
        or candidate["run_status"] != "ready"
    ):
        raise HTTPException(409, "Choose a validated draft from this completed report.")
    if digest([candidate["subject"], candidate["body"]]) != candidate["content_hash"]:
        raise HTTPException(
            409, "The saved draft failed its content check. No email was sent."
        )
    evidence = json.loads(candidate["evidence"])
    permission, _, _ = contact_permission(
        db,
        candidate["batch_id"],
        customer_id,
        evidence["features"],
        tenant=report["tenant"],
    )
    if permission != "allowed":
        raise HTTPException(
            409,
            "Current contact permission suppresses this draft. No email was sent.",
        )
    return candidate


def formatted_preview(db, report, candidate):
    from backend.features.campaigns.email_presentation import render

    run = db.execute(
        "SELECT specification,checkpoint FROM campaign_runs WHERE id=?",
        (report["run_id"],),
    ).fetchone()
    products = json.loads(run["specification"])["products"]
    product = next(
        (
            p
            for p in products
            if p["id"] == candidate["product_id"]
            and p["version"] == candidate["product_version"]
        ),
        None,
    )
    if not product:
        raise HTTPException(409, "The saved product terms are unavailable.")
    template = (
        json.loads(run["checkpoint"])
        .get("templates", {})
        .get(product["id"], {})
        .get("template", {})
    )
    benefit_ids = template.get("benefits", [])
    if not benefit_ids or any(key not in product["benefits"] for key in benefit_ids):
        raise HTTPException(409, "The saved benefit selection is unavailable.")
    profile = db.execute(
        "SELECT full_name FROM customer_profiles WHERE dataset='meridian' AND id=?",
        (candidate["customer_id"],),
    ).fetchone()
    recipient_name = os.getenv("BANKWEAVE_EMAIL_TEST_NAME", "").strip() or (
        profile["full_name"] if profile else "there"
    )
    sender_name = os.getenv("BANKWEAVE_EMAIL_SIGNATURE", "BankWeave team").strip()
    result = render(product, benefit_ids, recipient_name[:100], sender_name[:100])
    result["hash"] = digest([candidate["content_hash"], result])
    return result


def get_preview(report_id: str, customerId: str = Query(min_length=1, max_length=80)):
    require("campaign_review")
    from backend.features.campaigns.service import report_row

    with connect() as db:
        db.execute("BEGIN")
        report = report_row(db, report_id)
        return formatted_preview(
            db, report, validated_candidate(db, report, customerId)
        )


def send_test_email(report_id: str, body: TestEmailInput):
    identity = require("campaign_review")
    from backend.features.campaigns.service import report_row

    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        report = report_row(db, report_id)
        if report["review_status"] != "reviewed":
            raise HTTPException(
                409,
                "Mark the exact employee report reviewed before sending a test email.",
            )
        if (
            report["review_revision"] != body.revision
            or report["content_hash"] != body.contentHash
        ):
            raise HTTPException(
                409, "The report review changed. Reload it before sending."
            )
        config = settings()
        candidate = validated_candidate(db, report, body.customerId)
        presentation = formatted_preview(db, report, candidate)
        if body.presentationHash and body.presentationHash != presentation["hash"]:
            raise HTTPException(
                409,
                "The email presentation changed. Refresh the preview before sending.",
            )
        delivery_hash = presentation["hash"]
        previous = db.execute(
            "SELECT * FROM campaign_email_deliveries WHERE report_id=? AND customer_id=? AND recipient=? AND draft_hash=?",
            (report_id, body.customerId, config.recipient, delivery_hash),
        ).fetchone()
        if previous and (previous["status"] != "failed" or not body.retry):
            return receipt(previous)
        if previous and previous["attempt"] >= 3:
            raise HTTPException(
                409, "The draft has reached its explicit test-attempt limit."
            )
        if previous and previous["sender"] != config.sender:
            raise HTTPException(
                409,
                "The sender changed. Preserve the existing receipt and review the SMTP configuration.",
            )
        if overview(db, report)["remaining"] <= 0:
            raise HTTPException(
                429, "The daily test-email allowance is used. No email was sent."
            )
        if db.execute(
            "SELECT COUNT(*) FROM campaign_email_deliveries WHERE status='sending' AND updated_at>?",
            (
                datetime.fromtimestamp(
                    datetime.now(timezone.utc).timestamp() - 120, timezone.utc
                ).isoformat(),
            ),
        ).fetchone()[0]:
            raise HTTPException(
                409, "A test email is already being submitted. Wait for its receipt."
            )
        if "\r" in presentation["subject"] or "\n" in presentation["subject"]:
            raise HTTPException(409, "The saved draft has an invalid subject.")
        subject, text, html = (
            presentation["subject"],
            presentation["text"],
            presentation["html"],
        )
        delivery_id = previous["id"] if previous else identifier("MAIL")
        message_id = (
            previous["message_id"]
            if previous
            else f"<{delivery_id}@{config.sender.split('@')[1]}>"
        )
        if previous:
            db.execute(
                "UPDATE campaign_email_deliveries SET status='sending',attempt=attempt+1,error=NULL,actor_id=?,review_revision=?,updated_at=? WHERE id=?",
                (identity.actor_id, body.revision, now(), delivery_id),
            )
        else:
            timestamp = now()
            db.execute(
                "INSERT INTO campaign_email_deliveries(id,report_id,run_id,customer_id,tenant,actor_id,report_hash,review_revision,draft_hash,recipient,sender,subject,body,message_id,status,created_at,updated_at,html_body,presentation_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'sending',?,?,?,?)",
                (
                    delivery_id,
                    report_id,
                    report["run_id"],
                    body.customerId,
                    identity.tenant,
                    identity.actor_id,
                    report["content_hash"],
                    body.revision,
                    delivery_hash,
                    config.recipient,
                    config.sender,
                    subject,
                    text,
                    message_id,
                    timestamp,
                    timestamp,
                    html,
                    presentation["version"],
                ),
            )
    # External I/O happens after the durable claim commits, without a write lock.
    status, error = "accepted", None
    try:
        send_mail(
            config,
            message(
                config.sender, config.recipient, subject, text, message_id, html=html
            ),
        )
    except MailError as failure:
        status, error = "unknown" if failure.uncertain else "failed", str(failure)
    except Exception:
        status, error = (
            "unknown",
            "Submission confirmation is unavailable. Check the recipient inbox before taking further action.",
        )
    with connect() as db:
        db.execute(
            "UPDATE campaign_email_deliveries SET status=?,error=?,updated_at=? WHERE id=?",
            (status, error, now(), delivery_id),
        )
        return receipt(
            db.execute(
                "SELECT * FROM campaign_email_deliveries WHERE id=?", (delivery_id,)
            ).fetchone()
        )
