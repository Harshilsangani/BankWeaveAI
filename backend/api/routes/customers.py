"""HTTP routes for customers; domain behavior lives in backend.features.customers.records."""

from fastapi import APIRouter

import backend.features.customers.records as service

router = APIRouter(prefix="/data")

router.add_api_route("/customers", service.list_profiles, methods=["GET"])
router.add_api_route(
    "/customers/{customer_id}", service.customer_details, methods=["GET"]
)
router.add_api_route("/customers", service.create_profile, methods=["POST"])
router.add_api_route(
    "/customers/{customer_id}", service.update_profile, methods=["PATCH"]
)
router.add_api_route(
    "/customers/{customer_id}", service.delete_profile, methods=["DELETE"]
)
router.add_api_route("/records", service.records, methods=["GET"])
