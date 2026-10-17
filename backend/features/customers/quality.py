"""Scoped quality checks and atomic, reviewed CSV transaction append."""

import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.core.database import connect, metadata
from backend.core.identifiers import identifier, now
from backend.core.security import actor, require
from backend.workflows.operations import owner

COLUMNS = [
    "id",
    "account_id",
    "occurred_at",
    "amount",
    "currency",
    "region",
    "merchant",
    "channel",
    "device_id",
    "new_device",
    "flagged",
    "score",
]


class PreviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    datasetId: Literal["meridian", "bankshield"] = "meridian"
    csv: str = Field(min_length=1, max_length=1000000)


class ConfirmInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    previewId: str = Field(pattern=r"^IMPORT-[a-zA-Z0-9]+$")
    sourceHash: str = Field(min_length=64, max_length=64)
    confirmed: Literal[True]


def validate(db, dataset, rows):
    meta = json.loads(
        db.execute("SELECT metadata FROM datasets WHERE id=?", (dataset,)).fetchone()[0]
    )
    errors = []
    valid = []
    seen = set()
    accounts = {
        row["id"]
        for row in db.execute("SELECT id FROM accounts WHERE dataset=?", (dataset,))
    }
    devices = {
        row["id"]
        for row in db.execute("SELECT id FROM devices WHERE dataset=?", (dataset,))
    }
    for index, row in enumerate(rows):
        reasons = []
        if set(row) != set(COLUMNS):
            reasons.append("Row must match the exact CSV schema.")
        row = {key: str(row.get(key) or "").strip() for key in COLUMNS}
        if not re.fullmatch(r"[a-zA-Z0-9-]{1,80}", row["id"]):
            reasons.append("Invalid transaction ID.")
        if row["id"] in seen:
            reasons.append("Duplicate ID within the import.")
        seen.add(row["id"])
        if db.execute(
            "SELECT 1 FROM transactions WHERE dataset=? AND id=?", (dataset, row["id"])
        ).fetchone():
            reasons.append("Transaction ID already exists in this dataset.")
        if row["account_id"] not in accounts:
            reasons.append("Account parent is missing from this dataset.")
        elif not db.execute(
            "SELECT 1 FROM accounts a JOIN customers c ON c.dataset=a.dataset AND c.id=a.customer_id WHERE a.dataset=? AND a.id=?",
            (dataset, row["account_id"]),
        ).fetchone():
            reasons.append("Account has no valid customer parent.")
        if row["device_id"] and row["device_id"] not in devices:
            reasons.append("Device parent is missing from this dataset.")
        if dataset == "bankshield" and (row["device_id"] or row["new_device"] == "1"):
            reasons.append(
                "BankShield has no validated transaction-device mapping. Import without a device link."
            )
        if row["currency"] != meta["currency"]:
            reasons.append("Currency must match dataset " + meta["currency"] + ".")
        timestamp = None
        try:
            timestamp = datetime.fromisoformat(
                row["occurred_at"].replace("Z", "+00:00")
            )
            if timestamp.tzinfo is None:
                reasons.append("Timestamp requires an explicit timezone.")
            else:
                timestamp = timestamp.astimezone(timezone.utc)
                row["occurred_at"] = timestamp.isoformat().replace("+00:00", "Z")
            if row["occurred_at"][:7] not in meta["periods"]:
                reasons.append(
                    "Timestamp is outside the supported historical snapshot periods."
                )
            account = db.execute(
                "SELECT opened_on FROM accounts WHERE dataset=? AND id=?",
                (dataset, row["account_id"]),
            ).fetchone()
            if account and account[0] and row["occurred_at"][:10] < account[0][:10]:
                reasons.append("Transaction predates the account opening date.")
        except ValueError:
            reasons.append("Use an ISO timestamp with timezone.")
        amount_minor = 0
        score = 0
        try:
            amount = Decimal(row["amount"])
            if (
                not amount.is_finite()
                or not 0 < amount <= 1000000000
                or amount * 100 != (amount * 100).to_integral_value()
            ):
                raise ValueError()
            amount_minor = int(amount * 100)
        except (ValueError, InvalidOperation):
            reasons.append("Amount must be positive with at most two decimals.")
        try:
            score = Decimal(row["score"])
            if not score.is_finite() or not 0 <= score <= 100:
                raise ValueError()
            score = float(score)
        except (ValueError, InvalidOperation):
            reasons.append("Score must be between 0 and 100.")
        if row["new_device"] not in ("0", "1") or row["flagged"] not in ("0", "1"):
            reasons.append("new_device and flagged must be 0 or 1.")
        if row["new_device"] == "1" and not row["device_id"]:
            reasons.append("A new-device marker requires an observed device ID.")
        for key in ("region", "merchant", "channel"):
            if not row[key] or len(row[key]) > 80:
                reasons.append(key + " is required (up to 80 characters).")
        if dataset == "meridian" and row["region"] not in meta["regions"]:
            reasons.append("Region must match a supported Meridian branch region.")
        if reasons:
            errors.append(dict(row=index + 2, reasons=reasons))
        else:
            valid.append(
                (
                    dataset,
                    row["id"],
                    row["account_id"],
                    row["occurred_at"],
                    row["occurred_at"][:7],
                    amount_minor,
                    row["region"],
                    row["merchant"],
                    row["channel"],
                    row["device_id"] or None,
                    int(row["new_device"]),
                    int(row["flagged"]),
                    score,
                )
            )
    return valid, errors


def preview(body: PreviewInput):
    require("data_import")
    identity = owner()
    meta = metadata(body.datasetId)
    reader = csv.DictReader(io.StringIO(body.csv.lstrip("\ufeff")))
    if reader.fieldnames != COLUMNS:
        raise ValueError("Use the exact ordered CSV columns: " + ",".join(COLUMNS))
    rows = []
    for row in reader:
        rows.append(row)
        if len(rows) > 500:
            raise ValueError("Preview at most 500 transaction rows per import.")
    if not rows:
        raise ValueError("Supply at least one transaction row.")
    digest = hashlib.sha256(body.csv.encode()).hexdigest()
    preview_id = identifier("IMPORT")
    with connect() as db:
        valid, errors = validate(db, body.datasetId, rows)
        db.execute(
            "INSERT INTO import_previews VALUES(?,?,?,?,?,?,?,?,?,?)",
            (
                preview_id,
                identity,
                body.datasetId,
                digest,
                meta["version"],
                json.dumps(rows),
                json.dumps(errors),
                now(),
                "preview",
                None,
            ),
        )
    return dict(
        id=preview_id,
        sourceHash=digest,
        datasetId=body.datasetId,
        currency=meta["currency"],
        rows=len(rows),
        validRows=len(valid),
        errors=errors,
        canImport=not errors,
        columns=COLUMNS,
        sample=rows[:5],
    )


def confirm(body: ConfirmInput):
    require("data_import")
    identity = owner()
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        record = db.execute(
            "SELECT * FROM import_previews WHERE id=?", (body.previewId,)
        ).fetchone()
        if not record or record["owner"] != identity:
            raise PermissionError(
                "Import preview does not belong to this workspace/staff actor."
            )
        if body.sourceHash != record["source_hash"]:
            raise ValueError("The reviewed source hash does not match.")
        if record["status"] == "imported":
            return {**json.loads(record["receipt"]), "replayed": True}
        rows = json.loads(record["rows"])
        valid, errors = validate(db, record["dataset"], rows)
        if errors:
            raise ValueError(
                "Import rejected. Source rows contain errors or parent records changed; create a new preview."
            )
        meta = json.loads(
            db.execute(
                "SELECT metadata FROM datasets WHERE id=?", (record["dataset"],)
            ).fetchone()[0]
        )
        if meta["version"] != record["base_version"]:
            raise ValueError(
                "Dataset source version changed. Review a new preview before importing."
            )
        db.executemany(
            "INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", valid
        )
        db.executemany(
            "INSERT INTO device_events VALUES(?,?,?,?)",
            [(row[0], row[1], row[9], row[3]) for row in valid if row[9]],
        )
        meta.setdefault("baseFixtureVersion", meta["version"])
        meta["version"] = hashlib.sha256(
            (meta["version"] + record["source_hash"]).encode()
        ).hexdigest()
        meta["coverage"]["transactions"] += len(valid)
        meta["coverage"]["completeCustomerChains"] += len(valid)
        note = "Reviewed CSV append present: supplied flags/scores are unverified source observations, not adjudicated fraud."
        if note not in meta["limitations"]:
            meta["limitations"].append(note)
        db.execute(
            "UPDATE datasets SET metadata=? WHERE id=?",
            (json.dumps(meta), record["dataset"]),
        )
        receipt = dict(
            previewId=record["id"],
            importedRows=len(valid),
            sourceHash=record["source_hash"],
            datasetVersion=meta["version"],
            replayed=False,
        )
        db.execute(
            "UPDATE import_previews SET status='imported',receipt=? WHERE id=?",
            (json.dumps(receipt), record["id"]),
        )
        db.execute(
            "INSERT INTO audit_runs VALUES(?,?,?,?,?,?)",
            (
                identifier("RUN"),
                "transaction_import",
                json.dumps(
                    dict(
                        datasetId=record["dataset"],
                        previewId=record["id"],
                        actor=actor().actor_id,
                    )
                ),
                "Explicitly confirmed reviewed CSV import",
                now(),
                record["source_hash"],
            ),
        )
    return receipt


def quality(datasetId: Literal["meridian", "bankshield"] = "meridian"):
    meta = metadata(datasetId)
    with connect() as db:
        counts = {
            table: db.execute(
                f"SELECT COUNT(*) FROM {table} WHERE dataset=?", (datasetId,)
            ).fetchone()[0]
            for table in (
                "customers",
                "accounts",
                "loans",
                "transactions",
                "fraud_alerts",
                "devices",
                "device_events",
            )
        }
        checks = {
            "Transactions missing dates": db.execute(
                "SELECT COUNT(*) FROM transactions WHERE dataset=? AND occurred_at IS NULL",
                (datasetId,),
            ).fetchone()[0],
            "Transactions missing account parents": db.execute(
                "SELECT COUNT(*) FROM transactions t LEFT JOIN accounts a ON a.dataset=t.dataset AND a.id=t.account_id WHERE t.dataset=? AND a.id IS NULL",
                (datasetId,),
            ).fetchone()[0],
            "Accounts missing customer parents": db.execute(
                "SELECT COUNT(*) FROM accounts a LEFT JOIN customers c ON c.dataset=a.dataset AND c.id=a.customer_id WHERE a.dataset=? AND c.id IS NULL",
                (datasetId,),
            ).fetchone()[0],
            "Alerts missing transaction parents": db.execute(
                "SELECT COUNT(*) FROM fraud_alerts f LEFT JOIN transactions t ON t.dataset=f.dataset AND t.id=f.transaction_id WHERE f.dataset=? AND t.id IS NULL",
                (datasetId,),
            ).fetchone()[0],
            "Loans missing customer parents": db.execute(
                "SELECT COUNT(*) FROM loans l LEFT JOIN customers c ON c.dataset=l.dataset AND c.id=l.customer_id WHERE l.dataset=? AND c.id IS NULL",
                (datasetId,),
            ).fetchone()[0],
            "Transaction device links unavailable": db.execute(
                "SELECT COUNT(*) FROM transactions WHERE dataset=? AND device_id IS NULL",
                (datasetId,),
            ).fetchone()[0],
            "Transactions before known account opening": db.execute(
                "SELECT COUNT(*) FROM transactions t JOIN accounts a ON a.dataset=t.dataset AND a.id=t.account_id WHERE t.dataset=? AND a.opened_on IS NOT NULL AND substr(t.occurred_at,1,10)<substr(a.opened_on,1,10)",
                (datasetId,),
            ).fetchone()[0],
        }
        complete = db.execute(
            "SELECT COUNT(*) FROM transactions t JOIN accounts a ON a.dataset=t.dataset AND a.id=t.account_id JOIN customers c ON c.dataset=a.dataset AND c.id=a.customer_id WHERE t.dataset=?",
            (datasetId,),
        ).fetchone()[0]
    return dict(
        datasetId=datasetId,
        datasetName=meta["name"],
        version=meta["version"],
        currency=meta["currency"],
        counts=counts,
        checks=checks,
        completeCustomerChains=complete,
        duplicatePrimaryKeys=0,
        duplicateNote="Active-table primary keys reject duplicate IDs. Import previews separately detect duplicate input rows.",
        limitations=meta["limitations"],
        csvColumns=COLUMNS,
    )
