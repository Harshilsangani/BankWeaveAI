"""HTTP routes for conversations; domain behavior lives in backend.features.workspaces.conversations."""

from fastapi import APIRouter

import backend.features.workspaces.conversations as service

router = APIRouter()

router.add_api_route("/conversations", service.get_history, methods=["GET"])
router.add_api_route("/conversations", service.new_conversation, methods=["POST"])
router.add_api_route("/conversations", service.restore_conversation, methods=["PATCH"])
