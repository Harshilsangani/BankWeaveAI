"""HTTP routes for cases; domain behavior lives in backend.features.investigations.review."""

from fastapi import APIRouter

import backend.features.investigations.review as service
from backend.features.investigations.brief import BriefRequest, get_brief, prepare_brief

router = APIRouter()


@router.get("/cases/{inv_id}/brief")
def review_brief(inv_id: str):
    return get_brief(inv_id)


@router.post("/cases/{inv_id}/brief")
def create_review_brief(inv_id: str, body: BriefRequest):
    return prepare_brief(inv_id, body)


router.add_api_route("/cases", service.case_library, methods=["GET"])
router.add_api_route(
    "/cases/{inv_id}/source", service.case_source_status, methods=["GET"]
)
router.add_api_route("/cases/{inv_id}", service.get_case, methods=["GET"])
router.add_api_route("/cases/{inv_id}", service.update_case, methods=["PATCH"])
router.add_api_route(
    "/saved-investigations/{inv_id}", service.saved_investigation, methods=["GET"]
)
