"""Saved results, workspace ownership links and analysis audit receipts."""

import hashlib
import json

from backend.core.database import connect
from backend.core.identifiers import identifier, now
from backend.core.privacy import sanitize


def persist(kind, payload, scope, query=""):
    from backend.core.progress import check_cancelled

    check_cancelled()
    encoded = json.dumps(payload, ensure_ascii=False)
    with connect() as db:
        db.execute(
            "INSERT INTO artifacts VALUES(?,?,?,?)",
            (
                payload["id"],
                kind,
                encoded,
                payload.get("timestamp") or payload.get("createdAt") or now(),
            ),
        )
        from backend.features.workspaces.sessions import record

        record(db, kind, payload)
        if kind == "report":
            from backend.features.reports.html import save

            save(db, payload)
        if kind == "investigation":
            from backend.features.investigations.review import ensure_case

            ensure_case(db, payload)
        db.execute(
            "INSERT INTO audit_runs VALUES(?,?,?,?,?,?)",
            (
                identifier("RUN"),
                kind,
                json.dumps(scope),
                sanitize(query),
                now(),
                hashlib.sha256(encoded.encode()).hexdigest(),
            ),
        )
