"""HTTP routes for cases; domain behavior lives in backend.features.investigations.review."""

from fastapi import APIRouter

import backend.features.investigations.review as service

router = APIRouter()

router.add_api_route("/cases", service.case_library, methods=["GET"])
router.add_api_route(
    "/cases/{inv_id}/source", service.case_source_status, methods=["GET"]
)
router.add_api_route("/cases/{inv_id}", service.get_case, methods=["GET"])
router.add_api_route("/cases/{inv_id}", service.update_case, methods=["PATCH"])
router.add_api_route(
    "/saved-investigations/{inv_id}", service.saved_investigation, methods=["GET"]
)
