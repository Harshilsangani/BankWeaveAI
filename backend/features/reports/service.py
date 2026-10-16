"""Freeze owned investigation findings and the current staff review."""

import json

from backend.core.database import connect
from backend.core.identifiers import identifier, now
from backend.features.workspaces.artifacts import persist


def make_report(investigation_id, scenario=None):
    from backend.core.security import require
    from backend.features.workspaces.sessions import artifact_access

    require("analyze")
    artifact_access(investigation_id)
    with connect() as db:
        db.execute("BEGIN")
        row = db.execute(
            "SELECT payload FROM artifacts WHERE id=? AND kind='investigation'",
            (investigation_id,),
        ).fetchone()
        case = db.execute(
            "SELECT * FROM investigation_cases WHERE investigation_id=?",
            (investigation_id,),
        ).fetchone()
        events = db.execute(
            "SELECT * FROM case_events WHERE investigation_id=? ORDER BY created_at,id",
            (investigation_id,),
        ).fetchall()
    if not row:
        raise ValueError("Investigation not found. Open a saved investigation first.")
    inv = json.loads(row[0])
    result = dict(
        id=identifier("RPT"),
        title=inv["title"] + " — investigation report",
        createdAt=now(),
        investigation=inv,
    )
    if case:
        result["caseReview"] = {
            **dict(case),
            "scope": inv["scope"],
            "events": [dict(item) for item in events],
            "capturedAt": now(),
        }
    if scenario:
        result["scenario"] = scenario
    persist("report", result, inv["scope"])
    return result
