"""HTTP routes for approvals; domain behavior lives in backend.features.forms.approvals."""

from fastapi import APIRouter

import backend.features.forms.approvals as service

router = APIRouter()

router.add_api_route("/approvals", service.list_requests, methods=["GET"])
router.add_api_route("/approvals/{request_id}", service.get_request, methods=["GET"])
router.add_api_route(
    "/approvals/{request_id}/decision", service.decide_request, methods=["POST"]
)
