"""Shared HTTP scope validation."""

from backend.api.schemas import Scope
from backend.core.database import metadata
from backend.features.analytics.scope import validate_scope


def scoped(value: Scope):
    result = value.model_dump(exclude_none=True)
    result["period"] = (
        result.get("period") or metadata(result["datasetId"])["periods"][-1]
    )
    validate_scope(result)
    return result
