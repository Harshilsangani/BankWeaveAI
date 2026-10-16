"""Owned risk dismissal and reopening for the exact recorded scope."""

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict

from backend.core.database import connect, metadata
from backend.core.identifiers import identifier, now
from backend.core.security import actor, require
from backend.features.analytics.scope import validate_scope
from backend.features.workspaces.sessions import session_key


def workspace():
    sid = session_key.get()
    if sid:
        from backend.features.workspaces.sessions import ensure

        with connect() as db:
            ensure(db, sid)
    return sid or "local-tools:" + actor().actor_id


def risk_state(
    datasetId: Literal["meridian", "bankshield"] = "meridian", period: str | None = None
):
    period = period or metadata(datasetId)["periods"][-1]
    validate_scope(dict(datasetId=datasetId, period=period))
    workspace_id = workspace()
    with connect() as db:
        rows = db.execute(
            "SELECT risk_id FROM risk_dispositions WHERE workspace=? AND dataset=? AND period=? AND dismissed=1",
            (workspace_id, datasetId, period),
        ).fetchall()
    return dict(dismissed=[r["risk_id"] for r in rows])


class RiskDisposition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    datasetId: Literal["meridian", "bankshield"] = "meridian"
    period: str | None = None
    riskId: Literal["RSK-001", "RSK-002", "RSK-003", "BS-001"] | None = None
    action: Literal["dismiss", "restore"]


def set_risk_state(body: RiskDisposition):
    require("analyze")
    period = body.period or metadata(body.datasetId)["periods"][-1]
    validate_scope(dict(datasetId=body.datasetId, period=period, riskId=body.riskId))
    workspace_id = workspace()
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        targets = (
            [body.riskId]
            if body.riskId
            else [
                r[0]
                for r in db.execute(
                    "SELECT risk_id FROM risk_dispositions WHERE workspace=? AND dataset=? AND period=? AND dismissed=1",
                    (workspace_id, body.datasetId, period),
                )
            ]
        )
        if body.action == "dismiss" and not body.riskId:
            raise ValueError("Select a signal to dismiss.")
        for risk_id in targets:
            current = db.execute(
                "SELECT dismissed FROM risk_dispositions WHERE workspace=? AND dataset=? AND period=? AND risk_id=?",
                (workspace_id, body.datasetId, period, risk_id),
            ).fetchone()
            dismissed = 1 if body.action == "dismiss" else 0
            if current and current[0] == dismissed:
                continue
            db.execute(
                "INSERT OR REPLACE INTO risk_dispositions VALUES(?,?,?,?,?,?,?)",
                (
                    workspace_id,
                    body.datasetId,
                    period,
                    risk_id,
                    dismissed,
                    actor().actor_id,
                    now(),
                ),
            )
            db.execute(
                "INSERT INTO audit_runs VALUES(?,?,?,?,?,?)",
                (
                    identifier("RUN"),
                    "risk_" + body.action,
                    json.dumps(
                        dict(
                            datasetId=body.datasetId,
                            period=period,
                            riskId=risk_id,
                            actor=actor().actor_id,
                            workspace=workspace_id,
                        )
                    ),
                    "Explicit staff disposition",
                    now(),
                    "",
                ),
            )
    return risk_state(body.datasetId, period)
