"""HTTP routes for detectors; domain behavior lives in backend.features.risk.detection."""

from fastapi import APIRouter

import backend.features.risk.detection as service

router = APIRouter()

router.add_api_route("/detectors/run", service.manual_run, methods=["POST"])
router.add_api_route("/detectors/latest", service.latest_run, methods=["GET"])
