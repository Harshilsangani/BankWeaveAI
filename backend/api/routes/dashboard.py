"""Dashboard HTTP endpoints; stable public paths and request contracts."""

from typing import Literal

from fastapi import APIRouter

from backend.features.analytics.scope import validate_scope

router = APIRouter()


@router.get("/dashboard")
def get_dashboard(
    datasetId: Literal["meridian", "bankshield"] = "meridian", period: str | None = None
):
    from backend.features.dashboard.service import dashboard

    validate_scope(dict(datasetId=datasetId, period=period))
    return dashboard(datasetId, period)
