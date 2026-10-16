"""HTTP routes for imports; domain behavior lives in backend.features.imports.service."""

from fastapi import APIRouter

import backend.features.imports.service as service

router = APIRouter(prefix="/data/imports")

router.add_api_route("/schema", service.schemas, methods=["GET"])
router.add_api_route("/file", service.upload, methods=["POST"])
router.add_api_route("/review", service.review, methods=["POST"])
router.add_api_route("/apply", service.apply, methods=["POST"])
router.add_api_route("/history", service.history, methods=["GET"])
router.add_api_route("/template", service.template, methods=["GET"])
