"""Owned, durable case briefs with bounded model selection and explicit retries."""

import json
import time

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict

from backend.core.database import connect
from backend.core.identifiers import identifier, now
from backend.core.security import actor, require
from backend.features.investigations.brief_context import (
    PROMPT_VERSION,
    binding,
    context,
    render_selection,
)
from backend.features.investigations.review import canonical
from backend.features.workspaces.sessions import artifact_access, session_key
from backend.integrations.ai import get_provider
from backend.integrations.ai.context import (
    outbound,
    provider_calls,
    transmission_fields,
)

LEASE_SECONDS = 90
MAX_ATTEMPTS = 3
MAX_CONCURRENT = 2


class BriefRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    retry: bool = False


def owned_snapshot(inv_id):
    require("read")
    if not session_key.get():
        raise PermissionError(
            "An owned workspace is required to prepare a case review brief."
        )
    artifact_access(inv_id)
    with connect() as db:
        return canonical(db, inv_id)


def response(inv, row=None):
    _, artifact_hash, snapshot_hash = binding(inv)
    status = row["status"] if row else "not_prepared"
    expired = bool(row and status == "running" and row["lease_until"] <= time.time())
    payload = json.loads(row["payload"]) if row else {}
    if expired:
        status = "unavailable"
        payload = dict(
            message="Preparation was interrupted. Retry explicitly to prepare the saved snapshot."
        )
    return dict(
        status=status,
        brief=payload.get("brief"),
        message=payload.get("message", ""),
        execution=payload.get("execution"),
        attempts=row["attempts"] if row else 0,
        retryAllowed=bool(
            row and status == "unavailable" and row["attempts"] < MAX_ATTEMPTS
        ),
        sourceHash=snapshot_hash,
        artifactHash=artifact_hash,
        snapshotAt=inv["createdAt"],
    )


def get_brief(inv_id):
    inv = owned_snapshot(inv_id)
    key, _, _ = binding(inv)
    with connect() as db:
        row = db.execute(
            "SELECT * FROM case_review_briefs WHERE request_key=? AND tenant=?",
            (key, actor().tenant),
        ).fetchone()
    return response(inv, row)


def prepare_brief(inv_id: str, body: BriefRequest):
    require("analyze")
    inv = owned_snapshot(inv_id)
    key, artifact_hash, snapshot_hash = binding(inv)
    tenant = actor().tenant
    attempt = identifier("BRIEF-ATTEMPT")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        previous = db.execute(
            "SELECT * FROM case_review_briefs WHERE request_key=? AND tenant=?",
            (key, tenant),
        ).fetchone()
        if previous:
            saved = response(inv, previous)
            if saved["status"] in ("ready", "running") or not body.retry:
                return saved
            if not saved["retryAllowed"]:
                return saved
        if (
            db.execute(
                "SELECT COUNT(*) FROM case_review_briefs WHERE status='running' AND lease_until>?",
                (time.time(),),
            ).fetchone()[0]
            >= MAX_CONCURRENT
        ):
            raise HTTPException(
                429, "Other review briefs are being prepared. Try again shortly."
            )
        if previous:
            db.execute(
                "UPDATE case_review_briefs SET status='running',attempt_token=?,attempts=attempts+1,lease_until=?,payload='{}',updated_at=? WHERE request_key=? AND tenant=?",
                (attempt, time.time() + LEASE_SECONDS, now(), key, tenant),
            )
        else:
            db.execute(
                "INSERT INTO case_review_briefs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    key,
                    inv_id,
                    tenant,
                    actor().actor_id,
                    snapshot_hash,
                    artifact_hash,
                    PROMPT_VERSION,
                    "running",
                    attempt,
                    1,
                    time.time() + LEASE_SECONDS,
                    "{}",
                    now(),
                    now(),
                ),
            )

    # No database write transaction is held while waiting for the provider.
    calls, fields = [], []
    tokens = [
        (provider_calls, provider_calls.set(calls)),
        (transmission_fields, transmission_fields.set(fields)),
        (outbound, outbound.set(())),
    ]
    started = time.perf_counter()
    provider = None
    selection_valid = False
    try:
        supplied = context(inv)
        provider = get_provider()
        selected = provider.plan_case_review(supplied)
        content = render_selection(selected, supplied)
        selection_valid = True
        status = "ready"
        payload = dict(
            brief=dict(
                id=identifier("BRIEF"),
                caseId=inv_id,
                sourceHash=snapshot_hash,
                artifactHash=artifact_hash,
                snapshotAt=inv["createdAt"],
                promptVersion=PROMPT_VERSION,
                createdAt=now(),
                provider=provider.name,
                model=getattr(provider, "model", None),
                **content,
            )
        )
    except Exception:
        # Provider details and case contents are never reflected into error logs/UI.
        status = "unavailable"
        payload = dict(
            message="The review brief is unavailable. No case decision or note was changed. You can keep reviewing the saved evidence."
        )
    finally:
        for variable, token in reversed(tokens):
            variable.reset(token)
    execution = dict(
        mode="model"
        if provider and provider.external
        else "local"
        if provider
        else "unavailable",
        provider=provider.name if provider else None,
        model=getattr(provider, "model", None),
        calls=calls,
        modelCalls=len(calls),
        totalTokens=sum(call.get("totalTokens", 0) for call in calls),
        durationMs=round((time.perf_counter() - started) * 1000),
        validation="accepted" if selection_valid else "rejected_or_unavailable",
        outboundFields=fields,
    )
    payload["execution"] = execution
    if "brief" in payload:
        payload["brief"]["execution"] = execution
    with connect() as db:
        db.execute(
            "UPDATE case_review_briefs SET status=?,payload=?,lease_until=0,updated_at=? WHERE request_key=? AND tenant=? AND attempt_token=? AND status='running'",
            (
                status,
                json.dumps(payload, ensure_ascii=False),
                now(),
                key,
                tenant,
                attempt,
            ),
        )
        row = db.execute(
            "SELECT * FROM case_review_briefs WHERE request_key=? AND tenant=?",
            (key, tenant),
        ).fetchone()
    return response(inv, row)
