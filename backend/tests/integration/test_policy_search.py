"""Policy-search relevance and boundary checks on a disposable database."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import app
from backend.core import database
from backend.core.security import Identity, current_identity
from backend.features.knowledge import service

DOCUMENTS = (
    dict(
        id="POL-IDENTITY",
        version="v1",
        title="KYC review & documentation",
        category="Customer diligence",
        markdown="## Completeness\nVerify the completeness of the customer record and document missing information.\n## Discrepancies\nEscalate discrepancies to the designated compliance reviewer with supporting evidence.\n## Identity\nDo not infer identity or eligibility from demographic characteristics.",
    ),
    dict(
        id="POL-ALERT",
        version="v1",
        title="Suspicious transaction escalation",
        category="Fraud operations",
        markdown="## Alert validation\nValidate the alert against transaction history and device signals. A risk score alone is not confirmation of fraud.\n## Review and approval\nRefer high-severity cases to a human risk reviewer. Account restrictions require separate authorized approval.\n## Audit record\nPreserve an audit record of evidence and review decisions.",
    ),
    dict(
        id="POL-CREDIT",
        version="v1",
        title="Credit risk monitoring",
        category="Credit risk",
        markdown="## Comparability\nCompare rates using the same population definition and reporting window.\n## Concentration\nReview product and regional concentration before proposing interventions.\n## Decisions\nScenario outputs are model estimates; lending decisions require human review.",
    ),
)

# Plain-language and typo cases are distinct from the indexed policy wording.
QUERIES = (
    ("KYC review", "POL-IDENTITY"),
    ("know your customer", "POL-IDENTITY"),
    ("check someone's identification", "POL-IDENTITY"),
    ("identity documentation", "POL-IDENTITY"),
    ("what should staff do about mismatches", "POL-IDENTITY"),
    ("unusual payments", "POL-ALERT"),
    ("odd transfers", "POL-ALERT"),
    ("suspicious transactions", "POL-ALERT"),
    ("suspicous transactions", "POL-ALERT"),
    ("permission to freeze an account", "POL-ALERT"),
    ("record evidence", "POL-ALERT"),
    ("lending risk", "POL-CREDIT"),
    ("regional concentration", "POL-CREDIT"),
    ("same population reporting window", "POL-CREDIT"),
    ("credit risk monitoring", "POL-CREDIT"),
)


class PolicySearchTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="policy-search-")
        self.original = database.DB_PATH
        database.DB_PATH = Path(self.directory.name) / "application.sqlite3"
        database.initialize()
        self.identity = current_identity.set(Identity("policy-test-admin", "admin"))
        for document in DOCUMENTS:
            service.ingest(service.PolicyInput(**document))
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        current_identity.reset(self.identity)
        database.DB_PATH = self.original
        self.directory.cleanup()

    def test_ranked_relevance_for_plain_language_and_typos(self):
        for query, expected in QUERIES:
            with self.subTest(query=query):
                results = service.search(query)["results"]
                self.assertTrue(results)
                self.assertEqual(results[0]["documentId"], expected)

    def test_unrelated_and_generic_queries_abstain(self):
        for query in (
            "what is the policy",
            "quantum cryptocurrency tax optimization",
            "holiday booking",
            "cryptocurrency tax review",
            "!!!",
        ):
            with self.subTest(query=query):
                self.assertEqual(service.search(query)["results"], [])

    def test_exact_sections_beat_title_only_and_keep_source_bytes(self):
        matches = service.search("permission to freeze an account")["results"]
        self.assertEqual(matches[0]["section"], "Review and approval")
        with database.connect() as db:
            for match in matches:
                row = db.execute(
                    "SELECT text FROM policy_chunks WHERE reference=?",
                    (match["reference"],),
                ).fetchone()
                self.assertEqual(row["text"], match["text"])
                self.assertEqual(len(match["sha256"]), 64)

    def test_latest_version_replaces_search_without_changing_old_citations(self):
        old = service.search("KYC")["results"][0]
        service.ingest(
            service.PolicyInput(
                **{
                    **DOCUMENTS[0],
                    "version": "v2",
                    "markdown": "## Updated\nKYC now requires an independent second reviewer before escalation.",
                }
            )
        )
        matches = service.search("KYC")["results"]
        self.assertTrue(matches)
        self.assertTrue(all(match["version"] == "v2" for match in matches))
        with database.connect() as db:
            self.assertEqual(
                db.execute(
                    "SELECT text FROM policy_chunks WHERE reference=?",
                    (old["reference"],),
                ).fetchone()[0],
                old["text"],
            )

    def test_search_endpoint_is_readable_by_viewer_and_never_calls_provider(self):
        with patch(
            "backend.integrations.ai.get_provider",
            side_effect=AssertionError("Search must not use AI"),
        ):
            response = self.client.get(
                "/policies/search",
                params={"q": "odd transfers"},
                headers={"x-risklens-role": "viewer"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["modelCalls"], 0)
        self.assertEqual(response.json()["results"][0]["documentId"], "POL-ALERT")
        self.assertEqual(
            self.client.post(
                "/policies", json=DOCUMENTS[0], headers={"x-risklens-role": "viewer"}
            ).status_code,
            403,
        )

    def test_request_bounds_and_identity_are_enforced(self):
        for query in ("", "x" * 301):
            self.assertEqual(
                self.client.get("/policies/search", params={"q": query}).status_code,
                422,
            )
        self.assertEqual(
            self.client.get("/policies/search", params={"q": "   "}).status_code, 400
        )
        self.assertEqual(
            self.client.get(
                "/policies/search?q=KYC", headers={"x-risklens-role": "unknown"}
            ).status_code,
            403,
        )

    def test_duplicate_queries_are_stable_and_do_not_write_policy_data(self):
        with database.connect() as db:
            before = [
                tuple(row)
                for row in db.execute("SELECT * FROM policy_chunks ORDER BY reference")
            ]
        first = service.search("odd transfers")
        self.assertEqual(first, service.search("odd transfers"))
        with database.connect() as db:
            self.assertEqual(
                before,
                [
                    tuple(row)
                    for row in db.execute(
                        "SELECT * FROM policy_chunks ORDER BY reference"
                    )
                ],
            )

    def test_punctuation_and_unicode_normalization(self):
        self.assertEqual(
            service.search("ＫＹＣ")["results"], service.search("kyc")["results"]
        )
        self.assertEqual(
            service.search("unusual—payments")["results"],
            service.search("unusual payments")["results"],
        )

    def test_coverage_gap_does_not_call_answer_provider(self):
        with (
            patch("backend.features.knowledge.service.resolve", return_value={}),
            patch(
                "backend.features.knowledge.service.analysis_metadata", return_value={}
            ),
            patch(
                "backend.integrations.ai.get_provider",
                side_effect=AssertionError("No evidence, no paid answer"),
            ),
        ):
            response = service.answer("quantum cryptocurrency tax optimization", {})
        self.assertEqual(response["title"], "Policy coverage gap")
        self.assertFalse(
            any(block["type"] == "EVIDENCE" for block in response["blocks"])
        )


if __name__ == "__main__":
    unittest.main()
