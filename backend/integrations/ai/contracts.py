"""Typed model outputs and the provider protocol; no network calls."""

import re
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

ResearchSeries = Literal[
    "trend",
    "geography",
    "channel",
    "merchant",
    "loan_trend",
    "loan_type",
    "transaction_volume",
    "transaction_value",
    "cash_in",
    "cash_out",
    "cash_net",
    "cash_categories",
]

ResearchChartKind = Literal["area", "bar", "column", "donut"]


class StrictOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RouteDecision(StrictOutput):
    agent: Literal[
        "general_chat",
        "database_analyst",
        "knowledge_analyst",
        "research_analyst",
        "campaign_analyst",
    ]
    intent: Literal["default", "customer_summary", "customer_ranking"] = "default"
    ranking: Literal["transaction_value", "transaction_count", "loan_principal"] = (
        "transaction_value"
    )
    limit: int = Field(default=5, ge=1, le=20)


class ResearchScopeDecision(StrictOutput):
    focus: Literal["fraud", "loans", "portfolio", "transactions", "cashflow"]
    series: list[ResearchSeries] = Field(min_length=1, max_length=5)
    brief: str = Field(min_length=1, max_length=400)
    lastMonths: int | None = Field(default=None, ge=1, le=12)
    objectives: list[str] = Field(default_factory=list, max_length=5)


class ResearchChartChoice(StrictOutput):
    series: ResearchSeries
    kind: ResearchChartKind
    caption: str = Field(default="", max_length=3000)


class ResearchSection(StrictOutput):
    heading: str = Field(min_length=3, max_length=100)
    body: str = Field(min_length=1, max_length=7000)


class ResearchChartPlan(StrictOutput):
    text: str = Field(min_length=1, max_length=7000)
    charts: list[ResearchChartChoice] = Field(default_factory=list, max_length=6)
    sections: list[ResearchSection] = Field(default_factory=list, max_length=7)


class ResearchChartPick(StrictOutput):
    series: ResearchSeries
    kind: ResearchChartKind


class ResearchChartSelection(StrictOutput):
    charts: list[ResearchChartPick] = Field(min_length=1, max_length=6)


class ResearchNarrative(StrictOutput):
    text: str = Field(min_length=300, max_length=7000)
    sections: list[ResearchSection] = Field(min_length=5, max_length=7)


class GroundedReply(StrictOutput):
    text: str = Field(min_length=1, max_length=8000)
    references: list[str] = Field(default_factory=list, max_length=6)
    supported: bool


class GeneralReply(StrictOutput):
    text: str = Field(min_length=1, max_length=4000)


class CardOutreachTemplate(StrictOutput):
    subject: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=20, max_length=2500)
    benefits: list[str] = Field(min_length=1, max_length=4)


class CardCampaignScope(StrictOutput):
    period: str | None = Field(default=None, pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")
    productKind: Literal["all", "travel", "cashback", "entry"] = "all"


class ChartSelection(StrictOutput):
    reference: Literal["trend", "geography"]
    kind: Literal["area", "bar"]


class AnalyticalReply(StrictOutput):
    text: str = Field(min_length=1, max_length=4000)
    charts: list[ChartSelection] = Field(default_factory=list, max_length=2)


class CaseReviewSelection(StrictOutput):
    observationIds: list[str] = Field(min_length=1, max_length=4)
    hypothesisIds: list[str] = Field(min_length=1, max_length=2)
    checkIds: list[str] = Field(min_length=2, max_length=4)


class ProposedFields(StrictOutput):
    fullName: str = Field(default="", max_length=150)
    dateOfBirth: str = Field(default="", max_length=10)
    email: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=20)
    address: str = Field(default="", max_length=500)
    city: str = Field(default="", max_length=80)
    state: str = Field(default="", max_length=80)
    postalCode: str = Field(default="", max_length=10)


class FormExtraction(StrictOutput):
    markdown: str = Field(min_length=1, max_length=50000)
    fields: ProposedFields
    warnings: list[str] = Field(default_factory=list, max_length=12)


class Provider(Protocol):
    name: str
    external: bool

    def route(self, query: str, scope: dict | None = None) -> RouteDecision: ...
    def chat(self, query: str) -> GeneralReply: ...
    def extract_form(self, content: bytes, mime: str) -> FormExtraction: ...
    def answer_policy(self, query: str, chunks: list[dict]) -> GroundedReply: ...
    def explain_analysis(
        self, query: str, scope: dict, data: dict
    ) -> AnalyticalReply: ...
    def scope_research(
        self, query: str, catalog: list[dict], scope: dict | None = None
    ) -> ResearchScopeDecision: ...
    def plan_research(
        self, query: str, scope: dict, facts: dict, series: list[dict]
    ) -> ResearchChartPlan: ...
    def draft_card_template(
        self, product: dict, reason: str = ""
    ) -> CardOutreachTemplate: ...
    def scope_card_campaign(self, query: str) -> CardCampaignScope: ...
    def plan_case_review(self, context: dict) -> CaseReviewSelection: ...


def is_greeting(query):
    text = re.sub(r"[^\w\s]", " ", query.casefold()).strip()
    text = re.sub(r"\s+", " ", text)
    return bool(
        re.fullmatch(
            r"(?:hi|hello|hey|namaste|good morning|good afternoon|good evening)(?: (?:bankweave|bankweave ai|there|everyone|team))?",
            text,
        )
    )
