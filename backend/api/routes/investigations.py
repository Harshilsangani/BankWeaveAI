"""Investigations HTTP endpoints; stable public paths and request contracts."""

from fastapi import APIRouter, Request

from backend.api.common import scoped
from backend.api.schemas import EvidenceRequest, InvestigationRequest
from backend.features.analytics.queries import aggregate, evidence_rows
from backend.features.analytics.scope import resolve
from backend.features.investigations.service import investigate

router = APIRouter()


@router.post("/investigations/stream")
def stream_investigation(request: Request, body: InvestigationRequest):
    from backend.workflows.operations import fingerprint, start

    return start(
        request,
        fingerprint("investigation", body.model_dump()),
        lambda: investigation(body),
    )


@router.post("/investigations")
def investigation(body: InvestigationRequest):
    value = body.scope.model_dump(exclude_none=True)
    value["riskId"] = body.riskId
    value["domain"] = "loans" if body.riskId == "RSK-002" else "fraud"
    if body.riskId == "BS-001":
        if value["datasetId"] != "bankshield":
            raise ValueError("Select the BankShield dataset for this investigation.")
    elif value["datasetId"] != "meridian":
        raise ValueError("Select the Meridian dataset for this investigation.")
    if body.riskId == "RSK-003":
        value.setdefault("region", "Ahmedabad")
        value.setdefault("newDeviceOnly", True)
    return investigate(resolve("", value))


@router.post("/evidence")
def evidence(body: EvidenceRequest):
    scope = scoped(body.scope)
    count = aggregate(scope)["affected"]
    rows = evidence_rows(scope, body.offset, body.limit)
    columns = (
        ["Loan", "Original principal", "Region", "Product", "Customer", "Status"]
        if scope["domain"] == "loans"
        else ["Transaction", "Amount", "Region", "Channel", "Device", "Account link"]
    )
    return dict(
        columns=columns,
        rows=rows,
        total=count,
        offset=body.offset,
        nextOffset=body.offset + len(rows) if body.offset + len(rows) < count else None,
    )
