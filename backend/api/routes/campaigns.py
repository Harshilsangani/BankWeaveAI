"""HTTP routes for campaigns; domain behavior lives in backend.features.campaigns.service."""

from fastapi import APIRouter

import backend.features.campaigns.service as service

router = APIRouter()

router.add_api_route(
    "/card-campaigns/readiness", service.get_readiness, methods=["GET"]
)
router.add_api_route("/card-campaigns/products", service.get_products, methods=["GET"])
router.add_api_route("/card-campaigns", service.add_campaign, methods=["POST"])
router.add_api_route("/card-campaigns", service.list_campaigns, methods=["GET"])
router.add_api_route(
    "/card-campaigns/{campaign_id}", service.get_campaign, methods=["GET"]
)
router.add_api_route(
    "/card-campaigns/{campaign_id}/runs", service.start_run, methods=["POST"]
)
router.add_api_route(
    "/card-campaigns/{campaign_id}/runs/{run_id}", service.get_run, methods=["GET"]
)
router.add_api_route(
    "/card-campaigns/{campaign_id}/runs/{run_id}/cancel",
    service.cancel_run,
    methods=["POST"],
)
router.add_api_route(
    "/card-campaigns/{campaign_id}/runs/{run_id}/candidates",
    service.get_candidates,
    methods=["GET"],
)
router.add_api_route("/campaign-reports", service.list_reports, methods=["GET"])
router.add_api_route(
    "/campaign-reports/{report_id}", service.get_report, methods=["GET"]
)
router.add_api_route(
    "/campaign-reports/{report_id}/download", service.download_report, methods=["GET"]
)
router.add_api_route(
    "/campaign-reports/{report_id}/review", service.review_report, methods=["POST"]
)
router.add_api_route("/staff-notifications", service.get_notifications, methods=["GET"])
router.add_api_route(
    "/staff-notifications/{notification_id}",
    service.mark_notification,
    methods=["PATCH"],
)
router.add_api_route(
    "/staff-notifications/{notification_id}",
    service.delete_notification,
    methods=["DELETE"],
)
router.add_api_route(
    "/staff-notifications", service.clear_notifications, methods=["DELETE"]
)
router.add_api_route(
    "/card-campaigns/{campaign_id}/schedule",
    service.configure_schedule,
    methods=["POST"],
)
router.add_api_route(
    "/card-campaigns/consent", service.record_consent, methods=["POST"]
)
router.add_api_route("/card-campaigns/products", service.add_product, methods=["POST"])
