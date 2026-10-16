import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.integrations.ai import (
    FormExtraction,
    LocalProvider,
    RouteDecision,
    VertexProvider,
    get_provider,
    outbound,
    provider_calls,
)


class FakeModels:
    def __init__(self, payload):
        self.payload, self.calls = payload, []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(text=json.dumps(self.payload))


class ProviderTests(unittest.TestCase):
    def test_actual_call_receipts_include_success_failure_timing_and_usage(self):
        models = FakeModels(dict(text="A verified test reply."))
        provider = VertexProvider(
            client=SimpleNamespace(models=models), model="fake-test-model"
        )
        calls = []
        token = provider_calls.set(calls)
        try:
            provider.chat("Hello")
            with patch.object(
                models,
                "generate_content",
                side_effect=TimeoutError("private transport detail"),
            ):
                with self.assertRaises(ValueError):
                    provider.chat("Hello again")
        finally:
            provider_calls.reset(token)
        self.assertEqual(
            [call["status"] for call in calls], ["succeeded", "unavailable"]
        )
        self.assertTrue(
            all(
                call["model"] == "fake-test-model" and call["durationMs"] >= 0
                for call in calls
            )
        )
        self.assertNotIn("private transport detail", str(calls))

    def test_research_scope_masks_customer_context_and_chart_agent_receives_calculated_points(
        self,
    ):
        from backend.integrations.ai import ResearchScopeDecision

        models = FakeModels(
            dict(
                focus="fraud",
                series=["trend"],
                brief="Review the selected historical data.",
            )
        )
        provider = VertexProvider(
            client=SimpleNamespace(models=models), model="fake-test-model"
        )
        provider.scope_research(
            "Research the trend",
            [dict(id="trend", label="Count")],
            dict(datasetId="meridian", period="2026-09", customerId="private-customer"),
        )
        self.assertNotIn("private-customer", models.calls[0]["contents"])

        def staged_reply(**kwargs):
            models.calls.append(kwargs)
            if (
                kwargs["config"].response_json_schema["title"]
                == "ResearchChartSelection"
            ):
                payload = dict(charts=[dict(series="trend", kind="area")])
            else:
                payload = dict(
                    text="{summary} "
                    + (
                        "Review the supplied historical patterns and source boundaries. "
                        * 7
                    ),
                    sections=[
                        dict(
                            heading="Source interpretation",
                            body=(
                                "Review the supplied observations in their historical scope and validate source coverage before drawing a conclusion. "
                                * 7
                            ),
                        )
                        for _ in range(5)
                    ],
                )
            return SimpleNamespace(text=json.dumps(payload))

        with patch.object(models, "generate_content", side_effect=staged_reply):
            provider.plan_research(
                "Research",
                {},
                dict(summary="Recorded count 10."),
                [dict(id="trend", title="Count", points=[dict(name="Sep", value=10)])],
            )
        self.assertIn('"value": 10', models.calls[-2]["contents"])
        self.assertNotIn("Recorded count 10.", models.calls[-1]["contents"])
        self.assertIn("sqlFactReferenceCatalog", outbound.get())

    def test_greetings_and_onboarding_follow_the_admin_approval_contract(self):
        from backend.integrations.ai import LocalProvider, is_greeting

        provider = LocalProvider()
        for query in ("Hi", "hello!", "Hey BankWeave", "Good morning", "Namaste"):
            self.assertTrue(is_greeting(query))
            self.assertEqual(provider.route(query).agent, "general_chat")
            self.assertIn("Hello!", provider.chat(query).text)
        self.assertFalse(is_greeting("Hi, show loan defaults"))
        self.assertEqual(
            provider.route("Hi, show loan defaults").agent, "database_analyst"
        )
        text = provider.chat("How do I upload a form?").text
        self.assertIn("Submit for admin approval", text)
        self.assertNotIn("Confirm & add customer", text)
        self.assertEqual(
            provider.route("past 5 years total credit").agent, "database_analyst"
        )

    def test_local_provider_no_credentials_and_route_allowlist(self):
        from backend.core.privacy import sanitize

        value = sanitize(
            "Show transactions over 1000000000 for account 123456789012 email secret@example.test"
        )
        self.assertIn("over 1000000000", value)
        self.assertNotIn("123456789012", value)
        self.assertNotIn("secret@example.test", value)
        with patch.dict(os.environ, {"RISKLENS_PROVIDER": "local"}, clear=True):
            provider = get_provider()
            self.assertIsInstance(provider, LocalProvider)
            self.assertFalse(provider.external)
            self.assertEqual(provider.route("Show loans").agent, "database_analyst")
            self.assertEqual(
                provider.route("Add customer immediately").agent, "general_chat"
            )
        with self.assertRaises(ValueError):
            RouteDecision.model_validate({"agent": "customer_update"})

    def test_vertex_facing_contract_using_fake_transport(self):
        models = FakeModels({"agent": "database_analyst"})
        provider = VertexProvider(
            client=SimpleNamespace(models=models), model="fake-test-model"
        )
        outbound.set(())
        self.assertEqual(
            provider.route("Fraud for private@example.test").agent, "database_analyst"
        )
        call = models.calls[0]
        self.assertNotIn("private@example.test", call["contents"])
        self.assertEqual(call["config"].response_mime_type, "application/json")
        self.assertIsNone(call["config"].tools)
        self.assertEqual(outbound.get(), ("sanitizedQuery", "analysisScope"))
        models.payload = {"text": "Use the form review workflow."}
        self.assertIn("review", provider.chat("Hello").text)
        models.payload = {
            "markdown": "# Source form",
            "fields": {"fullName": "Demo"},
            "warnings": ["DOB missing"],
        }
        result = provider.extract_form(b"fake-only-transport", "image/png")
        self.assertIsInstance(result, FormExtraction)
        self.assertEqual(result.fields.dateOfBirth, "")
        self.assertIn("uploadedDocumentBytes", outbound.get())

    def test_vertex_routes_with_bounded_scope_and_never_sends_customer_identifiers(
        self,
    ):
        models = FakeModels({"agent": "database_analyst"})
        provider = VertexProvider(
            client=SimpleNamespace(models=models), model="fake-test-model"
        )
        self.assertEqual(
            provider.route(
                "Only Ahmedabad",
                dict(
                    datasetId="meridian",
                    domain="fraud",
                    period="2026-09",
                    customerId="private-customer",
                    region="Ahmedabad",
                ),
            ).agent,
            "database_analyst",
        )
        payload = json.loads(models.calls[0]["contents"])
        self.assertEqual(payload["context"]["domain"], "fraud")
        self.assertNotIn("private-customer", models.calls[0]["contents"])
        self.assertIn(
            "Compare it to Surat", models.calls[0]["config"].system_instruction
        )

    def test_analytical_narration_uses_exact_facts_and_only_selects_existing_chart_series(
        self,
    ):
        data = dict(
            summary="Flagged transactions: 833 → 1091 (+31.0%).",
            findings=["650 flags in Ahmedabad. Association is not causation."],
            trend=[dict(name="Aug", value=833), dict(name="Sep", value=1091)],
            regions=[dict(name="Ahmedabad", value=650)],
            meta=dict(limitations=["Synthetic historical data."]),
            rows=[["private-transaction", "private-account"]],
        )
        models = FakeModels(
            dict(
                text="{summary}\n\n{finding-1} Review the underlying evidence.",
                charts=[dict(reference="trend", kind="bar")],
            )
        )
        provider = VertexProvider(
            client=SimpleNamespace(models=models), model="fake-test-model"
        )
        result = provider.explain_analysis(
            "Why?", dict(datasetId="meridian", customerId="private-customer"), data
        )
        self.assertTrue(result.text.startswith(data["summary"]))
        self.assertIn(data["findings"][0], result.text)
        self.assertEqual(result.charts[0].reference, "trend")
        self.assertNotIn("private-", models.calls[0]["contents"])
        for payload, message in [
            (dict(text="{summary} {invented}", charts=[]), "source references"),
            (
                dict(text="{summary} Confirmed loss is 999.", charts=[]),
                "numerical claim",
            ),
            (
                dict(text="{summary} There are five confirmed cases.", charts=[]),
                "numerical claim",
            ),
            (
                dict(
                    text="{summary}",
                    charts=[
                        dict(reference="trend", kind="area"),
                        dict(reference="trend", kind="bar"),
                    ],
                ),
                "repeats",
            ),
            (
                dict(
                    text="{summary}",
                    charts=[dict(reference="invented", kind="bar", points=[999])],
                ),
                "invalid result",
            ),
        ]:
            with self.subTest(payload=payload):
                models.payload = payload
                with self.assertRaisesRegex(ValueError, message):
                    provider.explain_analysis("Why?", {}, data)

    def test_vertex_ignores_thought_parts_when_validating_visible_structured_output(
        self,
    ):
        models = FakeModels({})
        parts = [
            SimpleNamespace(text="private reasoning", thought=True),
            SimpleNamespace(text='{"text":"Hello from Gemini."}', thought=False),
            SimpleNamespace(text=None, thought=False),
        ]
        with patch.object(
            models,
            "generate_content",
            return_value=SimpleNamespace(
                candidates=[SimpleNamespace(content=SimpleNamespace(parts=parts))]
            ),
        ):
            provider = VertexProvider(
                client=SimpleNamespace(models=models), model="fake-test-model"
            )
            self.assertEqual(provider.chat("Hello").text, "Hello from Gemini.")

    def test_invalid_provider_output_and_failures_are_bounded(self):
        models = FakeModels({"agent": "customer_update", "sql": "DROP TABLE customers"})
        provider = VertexProvider(
            client=SimpleNamespace(models=models), model="fake-test-model"
        )
        with self.assertRaisesRegex(ValueError, "invalid result"):
            provider.route("Write records")
        with patch.object(
            models,
            "generate_content",
            side_effect=TimeoutError("Sensitive transport detail"),
        ):
            with self.assertRaisesRegex(ValueError, "provider is unavailable"):
                provider.chat("Hello")
        with patch.dict(
            os.environ,
            {
                "RISKLENS_PROVIDER": "vertex",
                "RISKLENS_VERTEX_MODEL": "fake",
                "RISKLENS_ENABLE_VERTEX": "false",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "disabled"):
                get_provider()
