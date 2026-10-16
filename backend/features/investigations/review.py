import hashlib
import json
from typing import Literal

from fastapi import HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from backend.core.database import connect
from backend.core.identifiers import identifier, now
from backend.core.security import actor, require
from backend.features.workspaces.sessions import artifact_access, session_key

SOURCE_VERSION = "investigation-source-v1"


def source_snapshot(db, scope):
    from backend.features.risk.detection import snapshot

    base, counts = snapshot(db, scope["datasetId"], scope["period"])
    digest = hashlib.sha256((SOURCE_VERSION + "\0" + base).encode())
    chunk = []
    total = 0
    # Relationship evidence also depends on device-event observations, which
    # are not inputs to the detector's count/rate rules.
    for row in db.execute(
        "SELECT * FROM device_events WHERE dataset=? ORDER BY transaction_id",
        (scope["datasetId"],),
    ):
        chunk.append(tuple(row))
        total += 1
        if len(chunk) >= 5000:
            digest.update(json.dumps(chunk, separators=(",", ":")).encode())
            chunk = []
    if chunk:
        digest.update(json.dumps(chunk, separators=(",", ":")).encode())
    counts["deviceEvents"] = total
    return digest.hexdigest(), counts


def canonical(db, inv_id):
    row = db.execute(
        "SELECT payload FROM artifacts WHERE id=? AND kind='investigation'", (inv_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Investigation not found.")
    return json.loads(row[0])


def ensure_case(db, inv):
    result = db.execute(
        "INSERT OR IGNORE INTO investigation_cases VALUES(?,?,?,?)",
        (inv["id"], actor().actor_id, "In review", 1),
    )
    if result.rowcount:
        event(db, inv, "opened", "Investigation ready for human review.")


def event(db, inv, kind, note):
    db.execute(
        "INSERT INTO case_events VALUES(?,?,?,?,?,?,?)",
        (
            identifier("CASE-EV"),
            inv["id"],
            actor().actor_id,
            kind,
            note,
            json.dumps(inv["scope"]),
            now(),
        ),
    )


def case_library(
    q: str = Query(default="", max_length=200),
    status: Literal["all", "In review", "Monitoring", "Resolved"] = "all",
    datasetId: Literal["meridian", "bankshield"] | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=50),
):
    sid = session_key.get()
    if not sid:
        return dict(items=[], total=0, offset=offset, limit=limit, nextOffset=None)
    from backend.features.workspaces.sessions import ensure

    with connect() as db:
        ensure(db, sid)
        sql = " FROM artifacts a JOIN session_artifacts access ON access.artifact_id=a.id AND access.session_id=? LEFT JOIN investigation_cases c ON c.investigation_id=a.id WHERE a.kind='investigation'"
        args = [sid]
        if status != "all":
            sql += " AND COALESCE(c.status,'In review')=?"
            args.append(status)
        if datasetId:
            sql += " AND json_extract(a.payload,'$.scope.datasetId')=?"
            args.append(datasetId)
        if q.strip():
            pattern = (
                "%"
                + q.strip()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
                + "%"
            )
            sql += " AND (a.id LIKE ? ESCAPE '\\' OR json_extract(a.payload,'$.title') LIKE ? ESCAPE '\\' OR c.owner LIKE ? ESCAPE '\\' OR CASE WHEN c.owner IN ('local-analyst','local-customer_operator') THEN 'Local analyst' WHEN c.owner='local-admin' THEN 'Local admin' ELSE 'Assigned staff reviewer' END LIKE ? ESCAPE '\\')"
            args.extend([pattern] * 4)
        total = db.execute("SELECT COUNT(*)" + sql, args).fetchone()[0]
        rows = db.execute(
            "SELECT a.payload,a.created_at,c.owner,c.status,c.revision,COALESCE((SELECT MAX(e.created_at) FROM case_events e WHERE e.investigation_id=a.id),a.created_at) updated"
            + sql
            + " ORDER BY updated DESC,a.id DESC LIMIT ? OFFSET ?",
            [*args, limit, offset],
        ).fetchall()
        items = []
        for row in rows:
            inv = json.loads(row["payload"])
            reports = db.execute(
                "SELECT COUNT(*) FROM artifacts r JOIN session_artifacts access ON access.artifact_id=r.id AND access.session_id=? WHERE r.kind='report' AND json_extract(r.payload,'$.investigation.id')=?",
                (sid, inv["id"]),
            ).fetchone()[0]
            items.append(
                dict(
                    id=inv["id"],
                    title=inv["title"],
                    scope=inv["scope"],
                    severity=inv["risk"]["severity"],
                    affectedRecords=inv["risk"]["affectedRecords"],
                    owner=row["owner"],
                    status=row["status"] or "In review",
                    revision=row["revision"] or 1,
                    createdAt=inv["createdAt"],
                    updatedAt=row["updated"],
                    reportCount=reports,
                )
            )
    return dict(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
        nextOffset=offset + limit if offset + limit < total else None,
    )


def case_source_status(inv_id: str):
    if not session_key.get():
        raise HTTPException(
            403, "A workspace is required to check a saved investigation source."
        )
    artifact_access(inv_id)
    with connect() as db:
        inv = canonical(db, inv_id)
    saved = inv.get("sourceSnapshot")
    if not saved or saved.get("version") != SOURCE_VERSION:
        return dict(
            state="unavailable",
            checkedAt=now(),
            savedAt=inv["createdAt"],
            reason="This earlier investigation has no complete recorded source hash. Its saved findings remain available.",
        )
    with connect() as db:
        db.execute("BEGIN")
        digest, counts = source_snapshot(db, inv["scope"])
    return dict(
        state="unchanged" if digest == saved["inputHash"] else "changed",
        checkedAt=now(),
        savedAt=inv["createdAt"],
        savedHash=saved["inputHash"],
        currentHash=digest,
        currentCounts=counts,
        reason="The dataset snapshot matches the saved investigation."
        if digest == saved["inputHash"]
        else "The dataset changed since this investigation. Saved findings and reports keep their original evidence; current record pages may differ.",
    )


def get_case(inv_id: str):
    artifact_access(inv_id)
    with connect() as db:
        inv = canonical(db, inv_id)
        ensure_case(db, inv)
        case = dict(
            db.execute(
                "SELECT * FROM investigation_cases WHERE investigation_id=?", (inv_id,)
            ).fetchone()
        )
        events = [
            dict(r)
            for r in db.execute(
                "SELECT * FROM case_events WHERE investigation_id=? ORDER BY created_at,id",
                (inv_id,),
            )
        ]
    return {**case, "events": events, "scope": inv["scope"]}


class CaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)
    status: Literal["In review", "Monitoring", "Resolved"] | None = None
    owner: Literal["local-analyst", "local-customer_operator", "local-admin"] | None = (
        None
    )
    kind: Literal["note", "action"] = "note"
    note: str = Field(default="", max_length=2000)


def update_case(inv_id: str, body: CaseUpdate):
    require("analyze")
    artifact_access(inv_id)
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        inv = canonical(db, inv_id)
        ensure_case(db, inv)
        case = db.execute(
            "SELECT * FROM investigation_cases WHERE investigation_id=?", (inv_id,)
        ).fetchone()
        if case["revision"] != body.revision:
            raise HTTPException(409, "The case changed. Reload before saving.")
        owner_changed = bool(body.owner and body.owner != case["owner"])
        status_changed = bool(body.status and body.status != case["status"])
        if owner_changed and actor().adapter != "development":
            raise ValueError(
                "Reviewer reassignment requires a configured staff directory. Keep the current reviewer."
            )
        if status_changed and body.status == "Resolved" and not body.note.strip():
            raise ValueError(
                "Add a resolution note describing the evidence reviewed and your conclusion."
            )
        if not body.note.strip() and not status_changed and not owner_changed:
            raise ValueError(
                "Add a note or change the case status or reviewer before saving."
            )
        if body.owner and body.owner != case["owner"]:
            event(db, inv, "assignment", f"Assigned to {body.owner}.")
        if body.status and body.status != case["status"]:
            event(db, inv, "status", f"{case['status']} → {body.status}")
        if body.note.strip():
            event(db, inv, body.kind, body.note.strip())
        db.execute(
            "UPDATE investigation_cases SET owner=?,status=?,revision=revision+1 WHERE investigation_id=?",
            (body.owner or case["owner"], body.status or case["status"], inv_id),
        )
    return get_case(inv_id)


def saved_investigation(inv_id: str):
    artifact_access(inv_id)
    with connect() as db:
        inv = canonical(db, inv_id)
        sid = session_key.get()
        if sid:
            from backend.features.workspaces.sessions import (
                conversation_key,
                ensure,
                owned_chat,
                save_chat,
            )

            state = ensure(db, sid)
            state["investigationId"] = inv_id
            cid = conversation_key.get() or state["activeConversationId"]
            current = json.loads(owned_chat(db, sid, cid)["state"])
            current["investigationId"] = inv_id
            save_chat(db, sid, cid, current)
            if cid != state["activeConversationId"]:
                state["investigationId"] = json.loads(
                    owned_chat(db, sid, state["activeConversationId"])["state"]
                ).get("investigationId")
            db.execute(
                "UPDATE workspace_sessions SET state=? WHERE id=?",
                (json.dumps(state), sid),
            )
        return inv
