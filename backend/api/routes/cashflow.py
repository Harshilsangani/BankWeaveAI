"""HTTP routes for cashflow; domain behavior lives in backend.features.products.cashflow."""

from fastapi import APIRouter

import backend.features.products.cashflow as service

router = APIRouter()

router.add_api_route(
    "/financial-health/{customer_id}", service.customer_health, methods=["GET"]
)
