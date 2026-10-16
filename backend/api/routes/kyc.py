"""HTTP routes for kyc; domain behavior lives in backend.features.customers.kyc."""

from fastapi import APIRouter

import backend.features.customers.kyc as service

router = APIRouter()

router.add_api_route(
    "/kyc/customer/{customer_id}", service.customer_cases, methods=["GET"]
)
router.add_api_route(
    "/kyc/customer/{customer_id}", service.create_case, methods=["POST"]
)
router.add_api_route("/kyc/{case_id}", service.review_case, methods=["PATCH"])
