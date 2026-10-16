"""HTTP routes for insurance; domain behavior lives in backend.features.products.insurance."""

from fastapi import APIRouter

import backend.features.products.insurance as service

router = APIRouter()

router.add_api_route(
    "/insurance/{customer_id}", service.customer_insurance, methods=["GET"]
)
