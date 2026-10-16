"""Consent/declared-needs rules. Review never enrolls or contacts a customer."""

import hashlib
import json
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from backend.core.database import connect
from backend.core.identifiers import identifier, now
from backend.core.privacy import sanitize
from backend.core.security import actor, require
from backend.features.analytics.queries import analysis_metadata
from backend.features.analytics.scope import resolve
from backend.features.products.insurance import overview
from backend.features.products.repayments import ledger

Need = Literal["health_cover", "repayment_support", "renewal_reminder"]


def seed():
    with connect() as db:
        for index, row in enumerate(
            db.execute(
                "SELECT id FROM customer_master WHERE dataset='meridian' ORDER BY id"
            ).fetchall()
        ):
            need = ["health_cover", "repayment_support", "renewal_reminder"][index % 3]
            db.execute(
                "INSERT OR IGNORE INTO customer_preferences VALUES(?,?,?,?,?,?,?,?)",
                (
                    "meridian",
                    row["id"],
                    1,
                    int(index % 5 != 0),
                    json.dumps([need]),
                    100000000,
                    "Synthetic declared-need fixture, not inferred from demographics",
                    now(),
                ),
            )


def preference(db, customer):
    if not db.execute(
        "SELECT 1 FROM customers WHERE dataset='meridian' AND id=?", (customer,)
    ).fetchone():
        raise ValueError("Select an existing Meridian customer.")
    row = db.execute(
        "SELECT * FROM customer_preferences WHERE dataset='meridian' AND customer_id=?",
        (customer,),
    ).fetchone()
    return dict(
        customerId=customer,
        revision=row["revision"] if row else 0,
        consent=bool(row["consent"]) if row else False,
        needs=json.loads(row["needs"]) if row else [],
        minimumCover=row["min_cover_minor"] / 100 if row else 0,
        provenance=row["provenance"] if row else "No declared needs supplied",
    )


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
    consent: bool
    needs: list[Need] = Field(max_length=3)
    minimumCover: int = Field(ge=0, le=100000000)
    reason: str = Field(min_length=5, max_length=500)


def update_preferences(customer_id: str, body: Preferences):
    require("customer_write")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        current = preference(db, customer_id)
        if body.revision != current["revision"]:
            raise HTTPException(409, "Declared needs changed. Reload before editing.")
        revision = body.revision + 1
        db.execute(
            "INSERT OR REPLACE INTO customer_preferences VALUES(?,?,?,?,?,?,?,?)",
            (
                "meridian",
                customer_id,
                revision,
                int(body.consent),
                json.dumps(sorted(set(body.needs))),
                body.minimumCover * 100,
                "Explicit staff-recorded customer declaration",
                now(),
            ),
        )
        db.execute(
            "INSERT INTO audit_runs VALUES(?,?,?,?,?,?)",
            (
                identifier("RUN"),
                "declared_needs_updated",
                json.dumps(
                    dict(
                        customerId=customer_id,
                        actor=actor().actor_id,
                        previous=current,
                        next=body.model_dump(),
                        revision=revision,
                    )
                ),
                body.reason,
                now(),
                "",
            ),
        )
    return current_run(customer_id)


def current_run(customer_id, period=None):
    scope = resolve(
        "",
        dict(
            datasetId="meridian",
            domain="fraud",
            customerId=customer_id,
            **({"period": period} if period else {}),
        ),
    )
    with connect() as db:
        pref = preference(db, customer_id)
    insurance = overview(scope)
    repayment = ledger({**scope, "domain": "loans", "riskId": "RSK-002"})
    facts = dict(
        preferences=pref,
        policySnapshot=insurance["snapshotHash"],
        loanSnapshot=repayment["snapshotHash"],
        asOf=insurance["asOf"],
    )
    digest = hashlib.sha256(json.dumps(facts, sort_keys=True).encode()).hexdigest()
    suggestions = []

    def add(kind, title, reason, source):
        suggestions.append(
            dict(
                id="REC-" + hashlib.sha256((digest + kind).encode()).hexdigest()[:16],
                kind=kind,
                title=title,
                reason=reason,
                sourceFacts=source,
                ruleVersion=VERSION,
                status="Pending review",
                revision=0,
            )
        )

    if pref["consent"]:
        active_health = [
            row
            for row in insurance["rows"]
            if row["product"] == "Health cover" and row["effectiveStatus"] == "Active"
        ]
        if "health_cover" in pref["needs"] and not any(
            row["cover_minor"] >= pref["minimumCover"] * 100 for row in active_health
        ):
            add(
                "health_cover",
                "Discuss requested health-cover information",
                "Declared health-cover need has no matching active recorded cover at the requested amount. Staff must verify other coverage and suitability before discussing options.",
                dict(
                    requestedCover=pref["minimumCover"],
                    activeRecordedPolicies=[row["id"] for row in active_health],
                    preferenceRevision=pref["revision"],
                ),
            )
        if "repayment_support" in pref["needs"] and repayment["delinquentLoans"]:
            add(
                "repayment_support",
                "Offer a repayment-support review",
                "Declared support need and dated unpaid principal warrant a staff conversation; this is not an automated lending or collection decision.",
                dict(
                    delinquentLoans=repayment["delinquentLoans"],
                    overduePrincipal=repayment["overduePrincipal"],
                    asOf=repayment["asOf"],
                    loanSnapshot=repayment["snapshotHash"],
                ),
            )
        expiring = [row for row in insurance["rows"] if row["expiringSoon"]]
        if "renewal_reminder" in pref["needs"] and expiring:
            add(
                "renewal_reminder",
                "Review an upcoming policy renewal",
                "A renewal reminder was requested and an active recorded policy expires within 60 days. No message has been sent.",
                dict(
                    policies=[
                        dict(id=row["id"], expires=row["end_on"]) for row in expiring
                    ],
                    asOf=insurance["asOf"],
                ),
            )
    payload = dict(
        customerId=customer_id,
        scope=scope,
        preferences=pref,
        suggestions=suggestions,
        inputHash=digest,
        rulesVersion=VERSION,
        limitations=[
            "Suggestions use declared needs/consent and recorded synthetic facts only; age, occupation and demographic proxies are not eligibility inputs.",
            "A review decision does not enroll a product, send a message or execute a banking action. Verify needs, other holdings and suitability with the customer.",
        ],
    )
    with connect() as db:
        existing = db.execute(
            "SELECT id FROM recommendation_runs WHERE dataset=? AND customer_id=? AND input_hash=? AND rules_version=?",
            ("meridian", customer_id, digest, VERSION),
        ).fetchone()
        run_id = existing["id"] if existing else identifier("RECOMMEND")
        payload["runId"] = run_id
        db.execute(
            "INSERT OR IGNORE INTO recommendation_runs VALUES(?,?,?,?,?,?,?)",
            (
                run_id,
                "meridian",
                customer_id,
                digest,
                VERSION,
                json.dumps(payload),
                now(),
            ),
        )
        for suggestion in suggestions:
            review = db.execute(
                "SELECT * FROM recommendation_reviews WHERE id=?", (suggestion["id"],)
            ).fetchone()
            if review:
                suggestion.update(
                    status=review["status"],
                    revision=review["revision"],
                    reviewNote=review["note"],
                    reviewActor=review["actor"],
                )
    return payload


def get_recommendations(customer_id: str):
    return current_run(customer_id)


class Review(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
    status: Literal["Reviewed for discussion", "Declined", "Pending review"]
    note: str = Field(min_length=5, max_length=500)


def review(customer_id: str, recommendation_id: str, body: Review):
    require("analyze")
    current = current_run(customer_id)
    selected = next(
        (item for item in current["suggestions"] if item["id"] == recommendation_id),
        None,
    )
    if not selected:
        raise HTTPException(
            409, "Source facts changed. Review the current suggestion instead."
        )
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        stored = db.execute(
            "SELECT revision FROM recommendation_reviews WHERE id=?",
            (recommendation_id,),
        ).fetchone()
        revision = stored["revision"] if stored else 0
        if revision != body.revision:
            raise HTTPException(
                409, "Another reviewer changed this suggestion. Reload."
            )
        db.execute(
            "INSERT OR REPLACE INTO recommendation_reviews VALUES(?,?,?,?,?,?)",
            (
                recommendation_id,
                body.status,
                body.note,
                actor().actor_id,
                revision + 1,
                now(),
            ),
        )
        db.execute(
            "INSERT INTO recommendation_events VALUES(?,?,?,?,?,?)",
            (
                identifier("REVIEW"),
                recommendation_id,
                body.status,
                body.note,
                actor().actor_id,
                now(),
            ),
        )
    return current_run(customer_id)


def answer(query, scope):
    scope = resolve("", scope)
    if scope["datasetId"] != "meridian" or not scope.get("customerId"):
        response = dict(
            id=identifier("MSG"),
            question=sanitize(query),
            context=scope,
            timestamp=now(),
            title="Choose a customer for recommendations",
            blocks=[
                dict(
                    type="TEXT",
                    text="Open a customer in Data Workspace to review declared needs, consent and evidence-backed staff suggestions. BankShield has no declared-needs or product coverage data.",
                )
            ],
            suggestions=[],
        )
    else:
        data = current_run(scope["customerId"], scope["period"])
        from backend.core.progress import emit

        emit("Declared needs and recommendation rules evaluated")
        evidence = [
            dict(
                id=item["id"],
                title=item["title"],
                source=item["ruleVersion"],
                detail=item["reason"],
                records=[
                    json.dumps(item["sourceFacts"], sort_keys=True),
                    "Run: " + data["runId"],
                    "Input hash: " + data["inputHash"],
                    "Status: " + item["status"],
                ],
            )
            for item in data["suggestions"]
        ]
        response = dict(
            id=identifier("MSG"),
            question=sanitize(query),
            context=scope,
            timestamp=now(),
            title="Customer suggestions for staff review",
            blocks=[
                dict(
                    type="TEXT",
                    text=f"{len(evidence)} suggestion(s) from declared needs and recorded facts. Consent: {'recorded' if data['preferences']['consent'] else 'not recorded; no suggestions generated'}. No enrollment or contact was executed.",
                )
            ]
            + ([dict(type="EVIDENCE", evidence=evidence)] if evidence else []),
            suggestions=[],
        )
    response["analysis"] = analysis_metadata(scope, response["id"])
    return response


VERSION = "staff-suggestion-rules-v1"
