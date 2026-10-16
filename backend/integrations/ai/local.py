"""Deterministic local provider used for development and offline verification."""

import re

from .contracts import (
    AnalyticalReply,
    CardCampaignScope,
    CardOutreachTemplate,
    FormExtraction,
    GeneralReply,
    GroundedReply,
    ResearchScopeDecision,
    RouteDecision,
    is_greeting,
)


class LocalProvider:
    name, external = "local", False

    def route(self, query, scope=None):
        from backend.features.research.service import is_research_question

        if is_greeting(query):
            return RouteDecision(agent="general_chat")
        from backend.features.campaigns.analyst import is_campaign_question

        if is_campaign_question(query):
            return RouteDecision(agent="campaign_analyst")
        if is_research_question(query) and not re.search(
            r"\bpolicy\b|\bpolicies\b|\bprocedure\b|\bdocumentation\b", query, re.I
        ):
            return RouteDecision(agent="research_analyst")
        customer = re.search(r"customer|coust[eo]mer|client", query, re.I)
        ranking = re.search(
            r"\btop\b|\bbig(?:gest)?\b|\blargest\b|\bhighest\b", query, re.I
        )
        if (customer and ranking) or (
            (scope or {}).get("view") == "customer_ranking"
            and re.search(r"only|compare|all regions|show more", query, re.I)
        ):
            count = re.search(r"\b(\d{1,2})\b", query)
            metric = (
                "loan_principal"
                if re.search(r"loan|borrow|principal", query, re.I)
                else "transaction_count"
                if re.search(
                    r"number of transactions|transaction count|most transactions",
                    query,
                    re.I,
                )
                else (scope or {}).get("ranking", "transaction_value")
            )
            return RouteDecision(
                agent="database_analyst",
                intent="customer_ranking",
                ranking=metric,
                limit=min(20, max(1, int(count[1])))
                if count
                else (scope or {}).get("limit", 5),
            )
        if re.search(
            r"financial health|cashflow|cash.flow|income|spending|salary|affordab",
            query,
            re.I,
        ):
            return RouteDecision(agent="database_analyst")
        if re.search(r"recommend|suggest.*customer|declared needs", query, re.I):
            return RouteDecision(agent="database_analyst")
        if re.search(r"insurance|coverage gap|nominee", query, re.I) and not re.search(
            r"procedure|documentation|what is the policy", query, re.I
        ):
            return RouteDecision(agent="database_analyst")
        if re.search(r"policy|policies|kyc|procedure|documentation", query, re.I):
            return RouteDecision(agent="knowledge_analyst")
        if re.search(r"add.*customer|save.*customer|upload.*form|onboard", query, re.I):
            return RouteDecision(agent="general_chat")
        database_words = r"fraud|transaction|loan|default|repay|installment|overdue|delinquen|outstanding|branch|merchant|risk|device|investigat|country|countries|region|report|compare|only|above|over|scenario|what.if|authentication|customers?|clients?|accounts?|database|dataset|records|overview|total credit|credit.*(?:year|trend)|(?:year|trend).*credit"
        return RouteDecision(
            agent="database_analyst"
            if re.search(database_words, query, re.I)
            or query.strip().lower() in ("why?", "why", "show more", "all")
            else "general_chat"
        )

    def chat(self, query):
        if re.search("add.*customer|save.*customer|onboard|form|upload", query, re.I):
            text = "Upload a filled PDF or PNG/JPEG form using the attachment button. The form reader extracts Markdown and proposes customer fields. Review them and select Submit for admin approval. An admin reviews the request in Data Workspace → Approval requests and approves or rejects it. Submission creates no customer; approval creates a pending-verification profile. A chat instruction alone cannot create a customer."
        elif is_greeting(query) or re.search(r"help|what can", query, re.I):
            text = "Hello! Welcome to BankWeave. I can analyse banking data, investigate risk, explain policy documents and read customer forms. Ask a question or attach a filled form to get started. Customer additions require admin approval; I cannot approve KYC or execute banking controls. This session runs locally; Gemini is not connected yet."
        else:
            text = "This local general assistant can explain the workspace and route supported banking tasks. For analysis, ask about transactions, merchant categories, country or branch risk. For onboarding, upload a form and review the proposed fields. Open-ended Gemini conversation will be enabled when Vertex AI is configured."
        return GeneralReply(text=text)

    def extract_form(self, content, mime):
        from backend.features.forms.service import extract_document

        return FormExtraction.model_validate(extract_document(content))

    def answer_policy(self, query, chunks):
        if not chunks:
            return GroundedReply(
                text="The supplied policy documents do not support an answer to this question. Add the applicable policy or refine the question. No external regulatory source was consulted.",
                references=[],
                supported=False,
            )
        return GroundedReply(
            text="The supplied policy sections state:\n\n"
            + "\n\n".join(f"{chunk['text']} [{chunk['reference']}]" for chunk in chunks)
            + "\n\nThese source excerpts require staff interpretation; they do not authorize a banking action.",
            references=[chunk["reference"] for chunk in chunks],
            supported=True,
        )

    def explain_analysis(self, query, scope, data):
        return AnalyticalReply(text=data["summary"])

    def scope_research(self, query, catalog, scope=None):
        from backend.features.research.service import infer_focus, requested_months

        focus = infer_focus(query)
        choices = {
            "cashflow": [
                "transaction_volume",
                "transaction_value",
                "cash_in",
                "cash_out",
                "cash_net",
            ],
            "transactions": [
                "transaction_volume",
                "transaction_value",
                "geography",
                "channel",
                "merchant",
            ],
            "loans": ["loan_trend", "geography", "loan_type"],
            "portfolio": [
                "transaction_volume",
                "trend",
                "loan_trend",
                "cash_net",
                "channel",
            ],
            "fraud": ["trend", "geography", "channel", "merchant"],
        }[focus]
        ids = {item["id"] for item in catalog}
        return ResearchScopeDecision(
            focus=focus,
            series=[item for item in choices if item in ids],
            lastMonths=requested_months(query),
            brief="The research covers the requested historical records with an explicit reporting window, source checks and limitations.",
            objectives=[
                "Reconcile the requested historical scope",
                "Explain observed trends and distributions",
                "Identify evidence gaps and follow-up checks",
            ],
        )

    def plan_research(self, query, scope, facts, series):
        from backend.features.research.service import local_plan

        return local_plan(facts, series)

    def draft_card_template(self, product, reason=""):
        return CardOutreachTemplate(
            subject="Explore {product_name}",
            body="Dear {display_name},\n\n{reason}\n\nYou may wish to review {product_name}.\n\n{benefits}\n\nAnnual fee: {fee}. {conditions}\n\n{disclosure}\n\nThis message is a draft for staff review. No offer has been sent.",
            benefits=list(product["benefits"])[:2],
        )

    def scope_card_campaign(self, query):
        import calendar

        period = None
        explicit = re.search(r"\b(20\d{2}-(?:0[1-9]|1[0-2]))\b", query)
        if explicit:
            period = explicit[1]
        else:
            for month in range(1, 13):
                match = re.search(
                    r"\b" + calendar.month_name[month] + r"\s+(20\d{2})\b", query, re.I
                )
                if match:
                    period = f"{match[1]}-{month:02}"
        kind = (
            "travel"
            if re.search("travel", query, re.I)
            else "cashback"
            if re.search("cashback|shopping", query, re.I)
            else "entry"
            if re.search("starter|secured|entry.level", query, re.I)
            else "all"
        )
        return CardCampaignScope(period=period, productKind=kind)
