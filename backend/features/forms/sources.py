"""Original form attachments remain bound to their owning staff workspace."""

import hashlib
from pathlib import Path

from fastapi import HTTPException

from backend.core.database import connect
from backend.core.security import require


def download_source(draft_id):
    from backend.features.workspaces.sessions import artifact_access, session_key

    require("form_read")
    if not session_key.get():
        raise PermissionError(
            "Open the owning workspace before downloading a document."
        )
    artifact_access(draft_id)
    with connect() as db:
        row = db.execute(
            "SELECT s.*,d.filename FROM form_sources s JOIN form_drafts d ON d.id=s.draft_id WHERE s.draft_id=?",
            (draft_id,),
        ).fetchone()
    if not row:
        raise HTTPException(
            404, "The original file was not retained for this older upload."
        )
    if hashlib.sha256(row["content"]).hexdigest() != row["sha256"]:
        raise HTTPException(409, "The stored document failed its integrity check.")
    return dict(
        content=row["content"],
        media_type=row["media_type"],
        filename=Path(row["filename"].replace("\\", "/")).name[:120],
        sha256=row["sha256"],
    )


def source_available(db, draft_id):
    return bool(
        db.execute(
            "SELECT 1 FROM form_sources WHERE draft_id=?", (draft_id,)
        ).fetchone()
    )
