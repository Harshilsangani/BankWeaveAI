"""HTTP routes for knowledge; domain behavior lives in backend.features.knowledge.service."""

from fastapi import APIRouter

import backend.features.knowledge.service as service

router = APIRouter()

router.add_api_route("/policies", service.upload_policy, methods=["POST"])
router.add_api_route("/policies", service.policies, methods=["GET"])
