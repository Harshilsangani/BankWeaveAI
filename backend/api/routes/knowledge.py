"""HTTP routes for knowledge; domain behavior lives in backend.features.knowledge.service."""

from fastapi import APIRouter, Query

import backend.features.knowledge.service as service

router = APIRouter()


@router.get("/policies/search")
def search_policies(q: str = Query(min_length=1, max_length=300)):
    return service.search(q)


router.add_api_route("/policies", service.upload_policy, methods=["POST"])
router.add_api_route("/policies", service.policies, methods=["GET"])
