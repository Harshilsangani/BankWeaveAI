"""HTTP routes for maintenance; domain behavior lives in backend.features.customers.maintenance."""

from fastapi import APIRouter

import backend.features.customers.maintenance as service

router = APIRouter(prefix="/maintenance")

router.add_api_route(
    "/{customer_id}/accounts", service.record_account, methods=["POST"]
)
router.add_api_route("/{customer_id}/policies", service.record_policy, methods=["POST"])
router.add_api_route(
    "/{customer_id}/policies/{policy_id}", service.update_policy, methods=["PATCH"]
)
router.add_api_route(
    "/{customer_id}/payments", service.record_payment, methods=["POST"]
)
router.add_api_route("/{customer_id}/reverse", service.reverse, methods=["POST"])
router.add_api_route("/{customer_id}", service.history, methods=["GET"])
