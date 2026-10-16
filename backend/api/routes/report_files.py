"""HTTP routes for report files; domain behavior lives in backend.features.reports.html."""

from fastapi import APIRouter

import backend.features.reports.html as service

router = APIRouter()

router.add_api_route("/reports/{report_id}/download", service.download, methods=["GET"])
