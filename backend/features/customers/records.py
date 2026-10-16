"""Manual customer administration and bounded, read-only source table browsing."""

import hashlib
import json
from typing import Literal

from fastapi import HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from backend.core.database import connect, metadata
from backend.core.identifiers import identifier, now
from backend.features.customers.models import CustomerFields

FIELD_MAP = dict(
    fullName="full_name",
    dateOfBirth="date_of_birth",
    email="email",
    phone="phone",
    address="address",
    city="city",
    state="state",
    postalCode="postal_code",
)
SOURCE_COLUMNS = {
    "customers": ["id"],
    "accounts": ["id", "customer_id", "opened_on"],
    "transactions": [
        "id",
        "account_id",
        "occurred_at",
        "amount_minor",
        "region",
        "merchant",
        "channel",
        "flagged",
    ],
    "fraud_alerts": [
        "id",
        "transaction_id",
        "detected_at",
        "alert_type",
        "status",
        "score",
    ],
    "devices": ["id", "customer_id", "first_seen", "last_seen"],
    "loans": ["id", "customer_id", "branch_id", "loan_type", "principal_minor"],
}


def profile(row):
    raw = dict(row)
    revision = hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest()
    return dict(
        id=raw["id"],
        fields={key: raw[column] or "" for key, column in FIELD_MAP.items()},
        status=raw["status"],
        source="Uploaded form" if raw["source_draft_id"] else "Manual entry",
        createdAt=raw["created_at"],
        revision=revision,
    )


def audit(db, action, customer_id):
    db.execute(
        "INSERT INTO audit_runs VALUES(?,?,?,?,?,?)",
        (
            identifier("RUN"),
            action,
            json.dumps({"customerId": customer_id}),
            "Explicit manual directory action",
            now(),
            "",
        ),
    )


def customer_record(db, row):
    result = profile(row)
    if db.execute(
        "SELECT 1 FROM record_import_sources WHERE dataset=? AND entity='customers' AND record_id=?",
        (row["dataset"], row["id"]),
    ).fetchone():
        result["source"] = "Spreadsheet import"
    master = db.execute(
        "SELECT * FROM customer_master WHERE dataset=? AND id=?",
        (row["dataset"], row["id"]),
    ).fetchone()
    if master:
        result["source"] = "Synthetic dataset"
        result["master"] = dict(
            branchId=master["branch_id"],
            branchName=master["branch_name"],
            region=master["region"],
            occupation=master["occupation"],
            creditScore=master["credit_score"],
            ageGroup=master["age_group"],
        )
    scope = (row["dataset"], row["id"])
    result["links"] = dict(
        accounts=db.execute(
            "SELECT COUNT(*) FROM accounts WHERE dataset=? AND customer_id=?", scope
        ).fetchone()[0],
        loans=db.execute(
            "SELECT COUNT(*) FROM loans WHERE dataset=? AND customer_id=?", scope
        ).fetchone()[0],
    )
    result["links"]["insurance"] = db.execute(
        "SELECT COUNT(*) FROM insurance_policies WHERE dataset=? AND customer_id=?",
        scope,
    ).fetchone()[0]
    tx = db.execute(
        "SELECT COUNT(*) count,COALESCE(SUM(t.flagged),0) flagged FROM transactions t JOIN accounts a ON a.dataset=t.dataset AND a.id=t.account_id WHERE a.dataset=? AND a.customer_id=?",
        scope,
    ).fetchone()
    result["links"].update(transactions=tx["count"], flagged=tx["flagged"])
    return result


class CreateProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fields: CustomerFields


class UpdateProfile(CreateProfile):
    revision: str = Field(min_length=64, max_length=64)


class DeleteProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: str = Field(min_length=64, max_length=64)


def reviewed_fields(fields):
    values = {key: value.strip() for key, value in fields.model_dump().items()}
    if len(values["fullName"]) < 2 or not values["dateOfBirth"]:
        raise ValueError("Supply the customer's full name and date of birth.")
    return values


def existing(db, customer_id, revision):
    row = db.execute(
        "SELECT * FROM customer_profiles WHERE id=?", (customer_id,)
    ).fetchone()
    if not row:
        raise HTTPException(
            404, "Customer profile no longer exists. Refresh the directory."
        )
    if profile(row)["revision"] != revision:
        raise HTTPException(
            409,
            "This customer changed since you opened it. Refresh and review the latest details.",
        )
    return row


def list_profiles(
    q: str = Query(default="", max_length=100),
    offset: int = Query(default=0, ge=0, le=100000),
    branch: str = Query(default="", max_length=40),
    source: Literal["", "synthetic", "uploaded", "manual"] = "",
    status: Literal["", "synthetic", "pending_verification"] = "",
    product: Literal["", "accounts", "loans", "insurance", "none"] = "",
):
    # instr treats %, _ and quotes as literal search text, not SQL wildcards.
    args = [q.strip().lower()] * 4
    where = "(instr(lower(p.full_name),?)>0 OR instr(lower(p.id),?)>0 OR instr(lower(p.city),?)>0 OR instr(lower(p.email),?)>0)"
    master = (
        "EXISTS(SELECT 1 FROM customer_master m WHERE m.dataset=p.dataset AND m.id=p.id"
    )
    if branch:
        where += f" AND {master} AND m.branch_id=?)"
        args.append(branch)
    if source == "synthetic":
        where += f" AND {master})"
    imported = "EXISTS(SELECT 1 FROM record_import_sources i WHERE i.dataset=p.dataset AND i.entity='customers' AND i.record_id=p.id)"
    if source == "uploaded":
        where += f" AND (p.source_draft_id IS NOT NULL OR {imported})"
    if source == "manual":
        where += f" AND p.source_draft_id IS NULL AND NOT {master}) AND NOT {imported}"
    if status:
        where += " AND p.status=?"
        args.append(status)
    if product in ("accounts", "loans", "insurance"):
        table = "insurance_policies" if product == "insurance" else product
        where += f" AND EXISTS(SELECT 1 FROM {table} r WHERE r.dataset=p.dataset AND r.customer_id=p.id)"
    elif product == "none":
        where += " AND NOT EXISTS(SELECT 1 FROM accounts r WHERE r.dataset=p.dataset AND r.customer_id=p.id) AND NOT EXISTS(SELECT 1 FROM loans r WHERE r.dataset=p.dataset AND r.customer_id=p.id) AND NOT EXISTS(SELECT 1 FROM insurance_policies r WHERE r.dataset=p.dataset AND r.customer_id=p.id)"
    with connect() as db:
        count = db.execute(
            f"SELECT COUNT(*) FROM customer_profiles p WHERE {where}", args
        ).fetchone()[0]
        total = db.execute("SELECT COUNT(*) FROM customer_profiles").fetchone()[0]
        uploaded = db.execute(
            f"SELECT COUNT(*) FROM customer_profiles p WHERE source_draft_id IS NOT NULL OR {imported}"
        ).fetchone()[0]
        synthetic = db.execute(
            "SELECT COUNT(*) FROM customer_profiles p JOIN customer_master m ON m.dataset=p.dataset AND m.id=p.id"
        ).fetchone()[0]
        rows = db.execute(
            f"SELECT p.* FROM customer_profiles p WHERE {where} ORDER BY CASE WHEN p.status='synthetic' THEN 0 ELSE 1 END,p.id LIMIT 15 OFFSET ?",
            [*args, offset],
        ).fetchall()
        branches = [
            dict(id=r["branch_id"], name=r["branch_name"])
            for r in db.execute(
                "SELECT DISTINCT branch_id,branch_name FROM customer_master ORDER BY branch_name"
            )
        ]
        records = [customer_record(db, row) for row in rows]
    return dict(
        rows=records,
        total=count,
        offset=offset,
        filters=dict(branches=branches),
        stats=dict(
            customers=total,
            synthetic=synthetic,
            uploaded=uploaded,
            manual=total - uploaded - synthetic,
        ),
        nextOffset=offset + len(rows) if offset + len(rows) < count else None,
    )


def customer_details(customer_id: str):
    with connect() as db:
        row = db.execute(
            "SELECT * FROM customer_profiles WHERE id=?", (customer_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Customer profile not found.")
        result = customer_record(db, row)
        scope = (row["dataset"], customer_id)
        result["accounts"] = [
            dict(r)
            for r in db.execute(
                "SELECT id,customer_id FROM accounts WHERE dataset=? AND customer_id=? ORDER BY id",
                scope,
            )
        ]
        result["loans"] = [
            dict(
                id=r["id"],
                customerId=r["customer_id"],
                type=r["loan_type"],
                principal=r["principal_minor"] / 100,
            )
            for r in db.execute(
                "SELECT * FROM loans WHERE dataset=? AND customer_id=? ORDER BY id",
                scope,
            )
        ]
        result["transactions"] = [
            dict(
                id=r["id"],
                accountId=r["account_id"],
                amount=r["amount_minor"] / 100,
                date=r["occurred_at"],
                flagged=bool(r["flagged"]),
            )
            for r in db.execute(
                "SELECT t.* FROM transactions t JOIN accounts a ON a.dataset=t.dataset AND a.id=t.account_id WHERE a.dataset=? AND a.customer_id=? ORDER BY t.occurred_at DESC,t.id LIMIT 6",
                scope,
            )
        ]
    return result


def create_profile(body: CreateProfile):
    from backend.core.security import require

    require("customer_write")
    values = reviewed_fields(body.fields)
    customer_id = identifier("CUS")
    with connect() as db:
        db.execute("INSERT INTO customers VALUES(?,?)", ("meridian", customer_id))
        db.execute(
            "INSERT INTO customer_profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                customer_id,
                "meridian",
                *[values[key] for key in FIELD_MAP],
                "pending_verification",
                None,
                now(),
            ),
        )
        audit(db, "customer_created_manually", customer_id)
        row = db.execute(
            "SELECT * FROM customer_profiles WHERE id=?", (customer_id,)
        ).fetchone()
    return profile(row)


def update_profile(customer_id: str, body: UpdateProfile):
    from backend.core.security import require

    require("customer_write")
    values = reviewed_fields(body.fields)
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        existing(db, customer_id, body.revision)
        assignments = ",".join(f"{column}=?" for column in FIELD_MAP.values())
        db.execute(
            f"UPDATE customer_profiles SET {assignments} WHERE id=?",
            [*[values[key] for key in FIELD_MAP], customer_id],
        )
        audit(db, "customer_updated_manually", customer_id)
        row = db.execute(
            "SELECT * FROM customer_profiles WHERE id=?", (customer_id,)
        ).fetchone()
    return profile(row)


def delete_profile(customer_id: str, body: DeleteProfile):
    from backend.core.security import require

    require("customer_write")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = existing(db, customer_id, body.revision)
        if (
            db.execute(
                "SELECT 1 FROM accounts WHERE dataset=? AND customer_id=? LIMIT 1",
                (row["dataset"], customer_id),
            ).fetchone()
            or db.execute(
                "SELECT 1 FROM loans WHERE dataset=? AND customer_id=? LIMIT 1",
                (row["dataset"], customer_id),
            ).fetchone()
            or db.execute(
                "SELECT 1 FROM insurance_policies WHERE dataset=? AND customer_id=? LIMIT 1",
                (row["dataset"], customer_id),
            ).fetchone()
        ):
            raise HTTPException(
                409,
                "This customer has linked accounts, loans or insurance policies. Resolve those relationships before deleting the profile.",
            )
        db.execute("DELETE FROM customer_profiles WHERE id=?", (customer_id,))
        # Current consent/needs cannot remain attached to a deleted identity.
        # Immutable recommendation runs and review events remain historical audits.
        db.execute(
            "DELETE FROM customer_preferences WHERE dataset=? AND customer_id=?",
            (row["dataset"], customer_id),
        )
        db.execute(
            "DELETE FROM customers WHERE dataset=? AND id=?",
            (row["dataset"], customer_id),
        )
        db.execute(
            "UPDATE form_drafts SET status='deleted' WHERE customer_id=?",
            (customer_id,),
        )
        audit(db, "customer_deleted_manually", customer_id)
    return dict(deleted=True, customerId=customer_id)


def records(
    dataset: Literal["meridian", "bankshield"] = "meridian",
    table: Literal[
        "customers", "accounts", "transactions", "fraud_alerts", "devices", "loans"
    ] = "transactions",
    q: str = Query(default="", max_length=100),
    offset: int = Query(default=0, ge=0, le=100000),
):
    meta = metadata(dataset)
    columns = SOURCE_COLUMNS[table]
    search = " OR ".join(
        f"instr(lower(COALESCE(CAST({column} AS TEXT),'')),?)>0" for column in columns
    )
    where = f"dataset=? AND ({search})"
    args = [dataset, *[q.strip().lower()] * len(columns)]
    # Both identifiers originate in our allowlist, never from arbitrary SQL input.
    with connect() as db:
        total = db.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {where}", args
        ).fetchone()[0]
        rows = db.execute(
            f"SELECT {','.join(columns)} FROM {table} WHERE {where} ORDER BY id LIMIT 15 OFFSET ?",
            [*args, offset],
        ).fetchall()
    labels = [
        "Amount (" + meta["currency"] + ")"
        if c in ("amount_minor", "principal_minor")
        else c.replace("_", " ").title()
        for c in columns
    ]
    unit = "₹" if meta["currency"] == "INR" else "$"
    values = [
        [
            f"{unit}{row[c] / 100:,.2f}"
            if c in ("amount_minor", "principal_minor")
            else row[c]
            if row[c] is not None
            else "—"
            for c in columns
        ]
        for row in rows
    ]
    return dict(
        columns=labels,
        rows=values,
        total=total,
        offset=offset,
        nextOffset=offset + len(rows) if offset + len(rows) < total else None,
        limitations=meta["limitations"],
        datasetName=meta["name"],
        currency=meta["currency"],
    )
