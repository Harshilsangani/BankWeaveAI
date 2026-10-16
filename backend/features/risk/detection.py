"""Deterministic, recorded snapshot rules. No scheduling or live-feed claim."""

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.core.database import connect, metadata
from backend.core.formatting import previous_period
from backend.core.identifiers import identifier, now
from backend.core.security import actor, require
from backend.features.analytics.queries import build, risk
from backend.features.analytics.scope import validate_scope

RULES_VERSION = "snapshot-rules-v2"
RULES = {
    "RSK-001": dict(
        name="Flagged-count acceleration",
        minCount=25,
        minIncreasePct=20,
        minBaselineCount=10,
        minRateIncreasePp=0.25,
    ),
    "RSK-002": dict(
        name="Default-marker acceleration",
        minCount=30,
        minIncreasePct=10,
        minBaselineCount=20,
        minRateIncreasePp=0.25,
    ),
    "RSK-003": dict(
        name="Ahmedabad flagged new-device activity",
        minCount=20,
        minIncreasePct=0,
        minBaselineCount=10,
        minRateIncreasePp=0.25,
    ),
    "BS-001": dict(name="Public sample fraud labels", minCount=1, minIncreasePct=None),
}


def detection_period(meta, period):
    # Detection compares completed source months, even when an analytical
    # caller requests full-history metrics. Never compare all history to itself.
    period = meta["periods"][-1] if not period or period == "all" else period
    validate_scope(dict(datasetId=meta["id"], period=period))
    return period


def active_rules(dataset):
    return ["BS-001"] if dataset == "bankshield" else ["RSK-001", "RSK-002", "RSK-003"]


def evaluate(rule_id, data, baseline_available):
    rule = RULES[rule_id]
    current = data["current"]
    prior = data["prior"]
    increase = data["delta"] if baseline_available else None
    rate_change = current["rate"] - prior["rate"] if baseline_available else None
    reason = "Rule thresholds were not reached."
    status = "clear"
    if rule["minIncreasePct"] is not None and (
        not baseline_available or prior["total"] == 0
    ):
        status = "insufficient"
        reason = "No preceding-month observations are available for comparison."
    elif (
        rule["minIncreasePct"] is not None
        and prior["affected"] < rule["minBaselineCount"]
    ):
        status = "insufficient"
        reason = (
            "Too few baseline positive records to support an acceleration comparison."
        )
    elif current["total"] == 0:
        status = "insufficient"
        reason = "No source observations exist in this scope."
    elif current["affected"] >= rule["minCount"] and (
        rule["minIncreasePct"] is None
        or increase is not None
        and increase >= rule["minIncreasePct"]
        and rate_change >= rule["minRateIncreasePp"]
    ):
        status = "matched"
        reason = "Recorded source observations meet the published demo thresholds."
    return dict(
        id=rule_id,
        name=rule["name"],
        status=status,
        reason=reason,
        currentCount=current["affected"],
        baselineCount=prior["affected"] if baseline_available else None,
        currentTotal=current["total"],
        baselineTotal=prior["total"] if baseline_available else None,
        currentRate=current["rate"],
        baselineRate=prior["rate"] if baseline_available else None,
        increasePct=increase,
        rateIncreasePp=rate_change,
        threshold=rule,
    )


def snapshot(db, dataset, period):
    # Streaming input hash: rows are folded into the digest in stable key
    # order as the cursor yields them, so a 10k-customer snapshot never
    # materializes the whole table set (or its JSON encoding) in memory.
    # Any inserted, deleted or modified source row changes the digest.
    periods = (period, previous_period(period))
    digest = hashlib.sha256()
    counts = {}

    def stream(sql, args):
        # Serialize in bounded chunks: one C-speed encoding per chunk keeps
        # peak memory flat without paying per-row Python call overhead.
        total = 0
        chunk = []
        for row in db.execute(sql, args):
            chunk.append(tuple(row))
            total += 1
            if len(chunk) >= 5000:
                digest.update(json.dumps(chunk, separators=(",", ":")).encode())
                chunk = []
        if chunk:
            digest.update(json.dumps(chunk, separators=(",", ":")).encode())
        digest.update(b"\x00")
        return total

    current = baseline = 0
    chunk = []
    for row in db.execute(
        "SELECT period,id,account_id,occurred_at,amount_minor,region,merchant,channel,device_id,new_device,flagged,score FROM transactions WHERE dataset=? AND (?='all' OR period IN (?,?)) ORDER BY id",
        (dataset, period, *periods),
    ):
        chunk.append(tuple(row))
        if len(chunk) >= 5000:
            digest.update(json.dumps(chunk, separators=(",", ":")).encode())
            chunk = []
        if period == "all" or row[0] == period:
            current += 1
        else:
            baseline += 1
    if chunk:
        digest.update(json.dumps(chunk, separators=(",", ":")).encode())
    digest.update(b"\x00")
    counts["currentTransactions"] = current
    counts["baselineTransactions"] = baseline
    counts["loans"] = stream(
        "SELECT id,customer_id,branch_id,loan_type,principal_minor,default_months FROM loans WHERE dataset=? ORDER BY id",
        (dataset,),
    )
    stream(
        "SELECT id,region FROM customer_master WHERE dataset=? ORDER BY id", (dataset,)
    )
    for table in (
        "customers",
        "accounts",
        "devices",
        "fraud_alerts",
        "loan_installments",
        "loan_payments",
    ):
        counts[table] = stream(
            f"SELECT * FROM {table} WHERE dataset=? ORDER BY id", (dataset,)
        )
    digest.update(metadata(dataset)["version"].encode())
    return digest.hexdigest(), counts


def run(dataset="meridian", period=None):
    meta = metadata(dataset)
    period = detection_period(meta, period)
    # One transaction holds the snapshot while the rule outputs are computed.
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        digest, counts = snapshot(db, dataset, period)
        existing = db.execute(
            "SELECT * FROM detector_runs WHERE dataset=? AND period=? AND rules_version=? AND input_hash=?",
            (dataset, period, RULES_VERSION, digest),
        ).fetchone()
        if existing:
            return unpack(existing, True)
        scopes = [
            dict(
                datasetId=dataset,
                period=period,
                domain="fraud",
                riskId="BS-001" if dataset == "bankshield" else "RSK-001",
            )
        ]
        if dataset == "meridian":
            scopes += [
                dict(
                    datasetId=dataset, period=period, domain="loans", riskId="RSK-002"
                ),
                dict(
                    datasetId=dataset,
                    period=period,
                    domain="fraud",
                    riskId="RSK-003",
                    region="Ahmedabad",
                    newDeviceOnly=True,
                ),
            ]
        run_id = identifier("DETECT")
        created = now()
        events = []
        checks = []
        for scope in scopes:
            data = build(scope)
            rule = RULES[scope["riskId"]]
            count = data["current"]["affected"]
            increase = data["delta"]
            check = evaluate(
                scope["riskId"], data, previous_period(period) in meta["periods"]
            )
            checks.append(check)
            if check["status"] != "matched":
                continue
            event = risk(scope, data)
            event["status"] = "Open"
            event["title"] = {
                "RSK-001": "Flagged transaction increase",
                "RSK-002": "Loan default-marker increase",
                "RSK-003": "Ahmedabad flagged new-device activity",
                "BS-001": "BankShield labelled transactions",
            }[scope["riskId"]]
            event.update(
                detection=dict(
                    runId=run_id,
                    rulesVersion=RULES_VERSION,
                    inputHash=digest,
                    sourceVersion=meta["version"],
                    sourceCounts=counts,
                    threshold=rule,
                    currentCount=count,
                    baselineCount=data["prior"]["affected"],
                    observedIncreasePct=increase,
                    executedAt=created,
                    scope=scope,
                )
            )
            event["evidence"].append(
                dict(
                    id=run_id + ":" + scope["riskId"],
                    title="Recorded detection rule",
                    source=RULES_VERSION,
                    detail=rule["name"] + " · " + json.dumps(rule),
                    records=[
                        "Run: " + run_id,
                        "Input SHA-256: " + digest,
                        "Source counts: " + json.dumps(counts),
                        f"Observed: {count} vs {data['prior']['affected']}",
                    ],
                )
            )
            events.append(event)
        thresholds = {key: RULES[key] for key in active_rules(dataset)}
        thresholds["_checks"] = checks
        db.execute(
            "INSERT INTO detector_runs VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (
                run_id,
                dataset,
                period,
                RULES_VERSION,
                digest,
                meta["version"],
                json.dumps(counts),
                json.dumps(thresholds),
                json.dumps(events),
                created,
                actor().actor_id,
            ),
        )
        row = db.execute("SELECT * FROM detector_runs WHERE id=?", (run_id,)).fetchone()
        return unpack(row, False)


def unpack(row, replayed):
    thresholds = json.loads(row["thresholds"])
    checks = thresholds.pop("_checks", [])
    return dict(
        id=row["id"],
        datasetId=row["dataset"],
        period=row["period"],
        method="rules",
        modelCalls=0,
        rulesVersion=row["rules_version"],
        inputHash=row["input_hash"],
        sourceVersion=row["source_version"],
        sourceCounts=json.loads(row["source_counts"]),
        thresholds=thresholds,
        checks=checks,
        events=json.loads(row["events"]),
        createdAt=row["created_at"],
        replayed=replayed,
    )


def latest_view(dataset, period):
    meta = metadata(dataset)
    period = detection_period(meta, period)
    with connect() as db:
        db.execute("BEGIN")
        digest, _ = snapshot(db, dataset, period)
        row = db.execute(
            "SELECT * FROM detector_runs WHERE dataset=? AND period=? AND rules_version=? AND input_hash=?",
            (dataset, period, RULES_VERSION, digest),
        ).fetchone()
        if not row:
            row = db.execute(
                "SELECT * FROM detector_runs WHERE dataset=? AND period=? ORDER BY created_at DESC,id DESC LIMIT 1",
                (dataset, period),
            ).fetchone()
    saved = unpack(row, True) if row else None
    return dict(
        datasetId=dataset,
        period=period,
        baselinePeriod=previous_period(period),
        baselineAvailable=previous_period(period) in meta["periods"],
        method="rules",
        modelCalls=0,
        rulesVersion=RULES_VERSION,
        snapshot=saved,
        stale=bool(
            saved
            and (saved["inputHash"] != digest or saved["rulesVersion"] != RULES_VERSION)
        ),
        rules=[dict(id=key, **RULES[key]) for key in active_rules(dataset)],
        coverage=meta["coverage"],
        limitations=meta["limitations"],
    )


class RunInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    datasetId: Literal["meridian", "bankshield"] = "meridian"
    period: str | None = Field(default=None, pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")


def manual_run(body: RunInput):
    require("analyze")
    return run(body.datasetId, body.period)


def latest_run(
    datasetId: Literal["meridian", "bankshield"] = "meridian", period: str | None = None
):
    return latest_view(datasetId, period)
