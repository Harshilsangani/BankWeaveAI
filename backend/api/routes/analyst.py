"""Analyst HTTP endpoints; stable public paths and request contracts."""

from fastapi import APIRouter, Request

from backend.api.schemas import Query
from backend.workflows.analyst import run_query

router = APIRouter()


@router.get("/analyst/{message_id}/export.pdf")
def export_research_pdf(message_id: str):
    from fastapi.responses import Response

    from backend.features.research.service import load_brief, render_pdf

    payload = load_brief(message_id)
    document = render_pdf(payload)
    return Response(
        document,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{message_id}-research-brief.pdf"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Content-SHA256": __import__("hashlib").sha256(document).hexdigest(),
        },
    )


@router.post("/analyst")
def query(body: Query):
    if not body.query.strip():
        raise ValueError("Enter a banking question to start an analysis.")
    return run_query(body.query, body.context.model_dump(exclude_none=True))


@router.post("/analyst/stream")
def stream_query(request: Request, body: Query):
    from backend.workflows.operations import fingerprint, start

    return start(request, fingerprint("query", body.model_dump()), lambda: query(body))
