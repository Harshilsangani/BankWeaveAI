"""HTTP routes for repayments; domain behavior lives in backend.features.products.repayments."""

from fastapi import APIRouter

import backend.features.products.repayments as service

router = APIRouter()

router.add_api_route(
    "/repayments/{customer_id}", service.customer_ledger, methods=["GET"]
)
