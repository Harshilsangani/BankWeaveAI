"""Risk queue scope and owned dispositions."""

from typing import Literal

from fastapi import APIRouter

from backend.features.analytics.scope import validate_scope
from backend.features.risk import dispositions as service

router = APIRouter()


@router.get("/risk-radar")
def get_radar(
    datasetId: Literal["meridian", "bankshield"] = "meridian", period: str | None = None
):
    from backend.features.dashboard.service import radar

    validate_scope(dict(datasetId=datasetId, period=period))
    return radar(datasetId, period)


router.add_api_route("/risk-state", service.risk_state, methods=["GET"])
router.add_api_route("/risk-state", service.set_risk_state, methods=["PATCH"])
