"""HTTP routes for recommendations; domain behavior lives in backend.features.products.recommendations."""

from fastapi import APIRouter

import backend.features.products.recommendations as service

router = APIRouter()

router.add_api_route(
    "/preferences/{customer_id}", service.update_preferences, methods=["PATCH"]
)
router.add_api_route(
    "/recommendations/{customer_id}", service.get_recommendations, methods=["GET"]
)
router.add_api_route(
    "/recommendations/{customer_id}/{recommendation_id}",
    service.review,
    methods=["PATCH"],
)
