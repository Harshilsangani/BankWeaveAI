"""HTTP routes for operations; domain behavior lives in backend.workflows.operations."""

from fastapi import APIRouter

import backend.workflows.operations as service

router = APIRouter()

router.add_api_route(
    "/operations/{request_id}", service.cancel_operation, methods=["DELETE"]
)
