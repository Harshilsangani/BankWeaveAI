"""Explicit registry of the application HTTP routers."""

from .analyst import router as analyst_router
from .approvals import router as approvals_router
from .campaigns import router as campaigns_router
from .cases import router as cases_router
from .cashflow import router as cashflow_router
from .conversations import router as conversations_router
from .customers import router as customers_router
from .dashboard import router as dashboard_router
from .data_quality import router as data_quality_router
from .detectors import router as detectors_router
from .forms import router as forms_router
from .imports import router as imports_router
from .insurance import router as insurance_router
from .investigations import router as investigations_router
from .knowledge import router as knowledge_router
from .kyc import router as kyc_router
from .maintenance import router as maintenance_router
from .operations import router as operations_router
from .recommendations import router as recommendations_router
from .repayments import router as repayments_router
from .report_files import router as report_files_router
from .reports import router as reports_router
from .risk import router as risk_router
from .system import router as system_router
from .workspaces import router as workspaces_router

ROUTERS = (
    risk_router,
    operations_router,
    approvals_router,
    campaigns_router,
    cases_router,
    report_files_router,
    customers_router,
    data_quality_router,
    imports_router,
    kyc_router,
    maintenance_router,
    insurance_router,
    repayments_router,
    cashflow_router,
    recommendations_router,
    conversations_router,
    detectors_router,
    knowledge_router,
    system_router,
    workspaces_router,
    dashboard_router,
    analyst_router,
    forms_router,
    investigations_router,
    reports_router,
)
