"""Public provider boundary: typed contracts, adapters and request-local override."""

import os

from .context import (
    outbound,
    provider_calls,
    provider_override,
    provider_usage,
    transmission_fields,
)
from .contracts import (
    AnalyticalReply,
    CardCampaignScope,
    CardOutreachTemplate,
    ChartSelection,
    FormExtraction,
    GeneralReply,
    GroundedReply,
    ProposedFields,
    Provider,
    ResearchChartChoice,
    ResearchChartKind,
    ResearchChartPick,
    ResearchChartPlan,
    ResearchChartSelection,
    ResearchNarrative,
    ResearchScopeDecision,
    ResearchSection,
    ResearchSeries,
    RouteDecision,
    StrictOutput,
    is_greeting,
)
from .local import LocalProvider
from .vertex import VertexProvider


__all__ = [
    "AnalyticalReply",
    "CardCampaignScope",
    "CardOutreachTemplate",
    "ChartSelection",
    "FormExtraction",
    "GeneralReply",
    "GroundedReply",
    "ProposedFields",
    "Provider",
    "ResearchChartChoice",
    "ResearchChartKind",
    "ResearchChartPick",
    "ResearchChartPlan",
    "ResearchChartSelection",
    "ResearchNarrative",
    "ResearchScopeDecision",
    "ResearchSection",
    "ResearchSeries",
    "RouteDecision",
    "StrictOutput",
    "LocalProvider",
    "VertexProvider",
    "get_provider",
    "is_greeting",
    "outbound",
    "provider_calls",
    "provider_override",
    "provider_usage",
    "transmission_fields",
]


def get_provider() -> Provider:
    override = provider_override.get()
    if override is not None:
        return override
    mode = os.environ.get("RISKLENS_PROVIDER", "local")
    if mode == "local":
        return LocalProvider()
    if mode == "vertex":
        return VertexProvider()
    raise ValueError("Choose local or vertex as RISKLENS_PROVIDER.")
