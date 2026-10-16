"""HTTP routes for data quality; domain behavior lives in backend.features.customers.quality."""

from fastapi import APIRouter

import backend.features.customers.quality as service

router = APIRouter(prefix="/data")

router.add_api_route("/imports/preview", service.preview, methods=["POST"])
router.add_api_route("/imports/confirm", service.confirm, methods=["POST"])
router.add_api_route("/quality", service.quality, methods=["GET"])
