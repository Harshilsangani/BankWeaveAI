import os
import tempfile
import unittest
from pathlib import Path

os.environ["RISKLENS_CHECKPOINT_DB"] = os.path.join(
    tempfile.mkdtemp(prefix="bankweave-research-"), "checkpoints.sqlite3"
)
os.environ["RISKLENS_PROVIDER"] = "local"

from backend.features.research.service import (
    answer,
    apply_plan,
    is_research_question,
    render_pdf,
)
from backend.integrations.ai import (
    LocalProvider,
    ResearchChartChoice,
    ResearchChartPlan,
    provider_override,
)
from backend.workflows.analyst import router


class ResearchModeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from backend.core import database as database
        from backend.features.datasets.demo_import import seed_meridian

        cls.temp = tempfile.TemporaryDirectory(prefix="research-tests-")
        cls.original_path = database.DB_PATH
        database.DB_PATH = Path(cls.temp.name) / "application.sqlite3"
        database.initialize()
        seed_meridian()

    @classmethod
    def tearDownClass(cls):
        from backend.core import database as database

        database.DB_PATH = cls.original_path
        cls.temp.cleanup()

    def test_research_language_is_recognized_without_changing_ordinary_questions(self):
        self.assertTrue(is_research_question("Research the fraud increase"))
        self.assertTrue(is_research_question("Prepare a deep dive on loan defaults"))
        self.assertFalse(is_research_question("Why did fraud increase this month?"))
        self.assertEqual(
            LocalProvider().route("Research fraud by channel").agent, "research_analyst"
        )
        self.assertEqual(
            LocalProvider().route("Why did fraud increase this month?").agent,
            "database_analyst",
        )

    def test_router_uses_research_for_a_research_question_or_the_mode_flag(self):
        research = router(
            dict(
                operation="query",
                query="Write a research briefing on card fraud",
                scope=dict(datasetId="meridian", domain="fraud"),
            )
        )
        self.assertEqual(research["agent"], "research_analyst")
        flagged = router(
            dict(
                operation="query",
                query="Why did fraud increase this month?",
                scope=dict(datasetId="meridian", domain="fraud", research=True),
            )
        )
        self.assertEqual(flagged["agent"], "research_analyst")
        ordinary = router(
            dict(
                operation="query",
                query="Why did fraud increase this month?",
                scope=dict(datasetId="meridian", domain="fraud"),
            )
        )
        self.assertEqual(ordinary["agent"], "database_analyst")
        policy = router(
            dict(
                operation="query",
                query="Research our KYC policy",
                scope=dict(datasetId="meridian", domain="fraud", research=True),
            )
        )
        self.assertEqual(policy["agent"], "knowledge_analyst")

    def test_chart_plan_cannot_invent_a_series(self):
        series = [
            dict(
                id="trend",
                title="Trend",
                subtitle="Count",
                points=[dict(name="Apr", value=10), dict(name="May", value=12)],
            )
        ]
        facts = {"summary": "Flagged transactions: 10."}
        plan = ResearchChartPlan(
            text="{summary}",
            charts=[ResearchChartChoice(series="merchant", kind="column")],
        )
        text, charts = apply_plan(facts, series, plan)
        self.assertEqual(text, facts["summary"])
        self.assertEqual(charts[0]["id"], "trend")
        self.assertEqual(charts[0]["kind"], "area")
        self.assertEqual(charts[0]["points"][1]["value"], 12)

    def test_research_brief_uses_database_points_and_exports_pdf(self):
        token = provider_override.set(LocalProvider())
        try:
            result = answer(
                "Research fraud across channels and regions",
                dict(datasetId="meridian", domain="fraud", period="2026-09"),
            )
        finally:
            provider_override.reset(token)
        self.assertTrue(result["research"])
        self.assertNotIn("research", result["context"])
        charts = [block for block in result["blocks"] if block["type"] == "CHART"]
        self.assertGreaterEqual(len(charts), 2)
        self.assertTrue(all(block["tone"] == "research" for block in charts))
        self.assertTrue(
            all(block["kind"] in ("area", "bar", "column", "donut") for block in charts)
        )
        self.assertTrue(
            any(point["value"] > 0 for block in charts for point in block["points"])
        )
        document = render_pdf(result)
        self.assertTrue(document.startswith(b"%PDF"))
        import fitz

        opened = fitz.open(stream=document, filetype="pdf")
        self.assertIn("Research brief", "".join(page.get_text() for page in opened))
        opened.close()

    def test_pdf_retains_long_series_tables_evidence_and_wrapped_text(self):
        result = dict(
            id="MSG-example",
            title="Research brief",
            blocks=[
                dict(
                    type="CHART",
                    title="Long history",
                    subtitle="All calculated months",
                    kind="area",
                    points=[dict(name=f"Month-{i}", value=i) for i in range(42)],
                ),
                dict(
                    type="TABLE",
                    title="Complete breakdown",
                    data=dict(
                        columns=["Reference"], rows=[[f"Row-{i}"] for i in range(22)]
                    ),
                ),
                dict(
                    type="TEXT",
                    text=("A detailed source explanation with visible words. " * 70)
                    + "FINAL-TEXT-MARKER",
                ),
                dict(
                    type="EVIDENCE",
                    evidence=[
                        dict(
                            id="SOURCE-KEEP",
                            title="Saved source",
                            detail="Evidence kept",
                            source="Fixture",
                            records=["FINAL-EVIDENCE-MARKER"],
                        )
                    ],
                ),
            ],
            analysis=dict(limitations=["FINAL-LIMITATION-MARKER"]),
        )
        with __import__("fitz").open(stream=render_pdf(result), filetype="pdf") as pdf:
            text = "\n".join(page.get_text() for page in pdf)
        self.assertRegex(text, r"Month-41\s+41")
        for expected in (
            "Row-21",
            "FINAL-TEXT-MARKER",
            "FINAL-EVIDENCE-MARKER",
            "FINAL-LIMITATION-MARKER",
        ):
            self.assertIn(expected, text)

    def test_loan_research_has_no_transaction_charts_or_fraud_narrative(self):
        result = answer(
            "Research loan defaults",
            dict(datasetId="meridian", domain="loans", period="2026-09"),
        )
        charts = [block for block in result["blocks"] if block["type"] == "CHART"]
        self.assertTrue(charts)
        self.assertTrue(
            all(
                "loan" in block["title"].lower() or "default" in block["title"].lower()
                for block in charts
            )
        )
        self.assertIn("765", str(result["blocks"]))

    def test_cashflow_question_honors_last_three_months_and_reconciles_the_ledger(self):
        from backend.core import database as database
        from backend.features.products.cashflow import seed

        seed()
        result = answer(
            "create full report of last 3 montionstransaction cashflows and all",
            dict(datasetId="meridian", domain="fraud", period="all"),
        )
        self.assertEqual(result["researchReport"]["focus"], "cashflow")
        self.assertEqual(
            result["researchReport"]["periods"], ["2026-07", "2026-08", "2026-09"]
        )
        charts = [b for b in result["blocks"] if b["type"] == "CHART"]
        self.assertEqual(len(charts), 6)
        self.assertTrue(
            all(
                p["name"] in ("2026-07", "2026-08", "2026-09")
                for b in charts
                if "Monthly" in b["title"] or "cashflow" in b["title"]
                for p in b["points"]
            )
        )
        from backend.features.research.data import collect

        tools = []
        data = collect(
            result["context"],
            "cashflow",
            result["researchReport"]["periods"],
            result["researchReport"]["periods"],
            tools,
        )
        flows = {
            series["id"]: series["points"]
            for series in data["series"]
            if series["id"].startswith("cash_")
        }
        with database.connect() as db:
            paid = {
                row[0]: row[1] / 100
                for row in db.execute(
                    "SELECT substr(paid_on,1,7),SUM(principal_paid_minor) FROM loan_payments WHERE dataset='meridian' AND substr(paid_on,1,7) IN ('2026-07','2026-08','2026-09') GROUP BY substr(paid_on,1,7)"
                )
            }
        for incoming, outgoing, net in zip(
            flows["cash_in"], flows["cash_out"], flows["cash_net"]
        ):
            self.assertAlmostEqual(
                net["value"],
                incoming["value"] - outgoing["value"] - paid.get(incoming["name"], 0),
                places=2,
            )
        self.assertEqual(
            result["analysis"]["researchExecution"]["successfulModelCalls"], 0
        )
        self.assertEqual(result["analysis"]["researchExecution"]["mode"], "local")

    def test_model_failure_is_visible_and_never_claims_model_written_research(self):
        class FailedWriter(LocalProvider):
            external = True
            name = "vertex"
            model = "fake-failed-model"

            def plan_research(self, *args):
                raise ValueError("Test provider unavailable")

        token = provider_override.set(FailedWriter())
        try:
            result = answer(
                "Research transactions",
                dict(datasetId="meridian", domain="fraud", period="2026-09"),
            )
        finally:
            provider_override.reset(token)
        self.assertEqual(result["analysis"]["researchExecution"]["mode"], "fallback")
        self.assertTrue(result["analysis"]["researchExecution"]["warnings"])
        with __import__("fitz").open(stream=render_pdf(result), filetype="pdf") as pdf:
            text = " ".join(page.get_text() for page in pdf)
        self.assertIn("MODEL FALLBACK", text)

    def test_numerical_claims_and_unknown_source_references_are_rejected(self):
        from backend.features.research.service import validate_prose

        for text in (
            "The balance is 999.",
            "{invented}",
            "There are five confirmed fraud cases.",
        ):
            with self.assertRaises(ValueError):
                validate_prose(text, dict(summary="Verified source."))
        validate_prose(
            "{summary} Review the recorded source before drawing conclusions.",
            dict(summary="Verified source."),
        )
