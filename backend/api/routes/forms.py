"""Forms HTTP endpoints; stable public paths and request contracts."""

from fastapi import APIRouter, File, Request, UploadFile

from backend.api.schemas import CustomerConfirmation
from backend.core.database import connect
from backend.features.customers.models import CustomerFields
from backend.workflows.forms import extract_uploaded_content

router = APIRouter()


@router.post("/forms")
def upload_form(file: UploadFile = File(...)):
    from pathlib import Path

    content = file.file.read(8 * 1024 * 1024 + 1)
    if not content or len(content) > 8 * 1024 * 1024:
        raise ValueError("Upload a non-empty PDF or image up to 8 MB.")
    filename = Path((file.filename or "banking-form").replace("\\", "/")).name[:120]
    return extract_uploaded_content(content, filename)


@router.post("/forms/stream")
def stream_form(request: Request, file: UploadFile = File(...)):
    import hashlib
    from pathlib import Path

    from backend.workflows.operations import fingerprint, start

    content = file.file.read(8 * 1024 * 1024 + 1)
    if not content or len(content) > 8 * 1024 * 1024:
        raise ValueError("Upload a non-empty PDF or image up to 8 MB.")
    filename = Path((file.filename or "banking-form").replace("\\", "/")).name[:120]
    return start(
        request,
        fingerprint(
            "form", dict(filename=filename, sha256=hashlib.sha256(content).hexdigest())
        ),
        lambda: extract_uploaded_content(content, filename),
    )


@router.get("/forms/{draft_id}/source")
def original_form_source(draft_id: str):
    import re
    from urllib.parse import quote

    from fastapi.responses import Response

    from backend.features.forms.sources import download_source

    if not re.fullmatch(r"FORM-[a-zA-Z0-9]+", draft_id):
        raise ValueError("Select a saved form.")
    source = download_source(draft_id)
    return Response(
        source["content"],
        media_type=source["media_type"],
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''"
            + quote(source["filename"], safe=""),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Content-SHA256": source["sha256"],
        },
    )


@router.post("/customers")
def customer_confirmation(body: CustomerConfirmation):
    from backend.features.forms.approvals import submit_form

    return submit_form(
        body.threadId,
        body.draftId,
        body.fields.model_dump(),
        body.reviewRevision,
        body.duplicateDecision,
        body.duplicateReason,
    )


@router.patch("/forms/{draft_id}")
def correct_form(draft_id: str, body: CustomerFields):
    from backend.features.workspaces.sessions import form_access

    form_access(draft_id)
    from backend.features.forms.quality import save_correction

    return save_correction(draft_id, body.model_dump())


@router.get("/forms/{draft_id}")
def saved_form_review(draft_id: str):
    from backend.features.forms.quality import saved_review

    return saved_review(draft_id)


@router.get("/customers")
def customer_profiles():
    # Local demo profile directory only. Source identity tables are not exposed.
    with connect() as db:
        rows = db.execute(
            "SELECT id,full_name,city,status,created_at FROM customer_profiles ORDER BY created_at DESC LIMIT 50"
        ).fetchall()
    return [dict(r) for r in rows]
