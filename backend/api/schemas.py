"""Strict request contracts shared by the main banking HTTP routes."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool

from backend.features.customers.models import CustomerFields


class SessionSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    datasetId: Literal["meridian", "bankshield"] = "meridian"
    period: str | None = Field(default=None, pattern=r"^(all|20\d{2}-(0[1-9]|1[0-2]))$")


class Scope(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    domain: Literal["fraud", "loans"] = "fraud"
    view: Literal["customer_ranking", "customer_summary"] | None = None
    ranking: (
        Literal["transaction_value", "transaction_count", "loan_principal"] | None
    ) = None
    limit: int | None = Field(default=None, ge=1, le=20)
    datasetId: Literal["meridian", "bankshield"] = "meridian"
    period: str | None = Field(default=None, pattern=r"^(all|20\d{2}-(0[1-9]|1[0-2]))$")
    region: str | None = Field(default=None, max_length=50)
    comparison: str | None = Field(default=None, max_length=50)
    minAmount: float | None = Field(default=None, ge=0, le=1_000_000_000)
    newDeviceOnly: StrictBool | None = None
    riskId: str | None = Field(default=None, max_length=30)
    customerId: str | None = Field(
        default=None, max_length=80, pattern=r"^[a-zA-Z0-9-]+$"
    )
    research: StrictBool | None = None


class Query(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=1000)
    context: Scope = Field(default_factory=Scope)


class InvestigationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    riskId: Literal["RSK-001", "RSK-002", "RSK-003", "RSK-004", "BS-001"]
    scope: Scope = Field(default_factory=Scope)


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    riskId: Literal["RSK-001", "RSK-003"]
    coverage: float = Field(ge=0, le=100)
    effectiveness: float = Field(ge=0, le=100)
    friction: float = Field(ge=0, le=30)
    scope: Scope = Field(default_factory=Scope)


class ReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    investigationId: str = Field(min_length=1, max_length=80)
    scenarioInput: Scenario | None = None


class EvidenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Scope
    offset: int = Field(default=0, ge=0, le=100000)
    limit: int = Field(default=10, ge=1, le=50)


class CustomerConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    threadId: str = Field(min_length=1, max_length=80)
    draftId: str = Field(min_length=1, max_length=80)
    confirmed: Literal[True]
    fields: CustomerFields
    reviewRevision: int | None = Field(default=None, ge=1)
    duplicateDecision: Literal["reuse", "create_separate"] | None = None
    duplicateReason: str = Field(default="", max_length=500)
