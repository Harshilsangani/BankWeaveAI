"""Case-review acceptance uses copied SQLite state and fake/local providers."""

import json
import sqlite3
import tempfile
import threading
import time
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import app
from backend.core import database
from backend.integrations.ai import LocalProvider, VertexProvider


class CountingProvider(LocalProvider):
    def __init__(self):
        self.count = 0

    def plan_case_review(self, context):
        self.count += 1
        return super().plan_case_review(context)


class CaseBriefTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="case-brief-tests-")
        cls.original = database.DB_PATH
        target = Path(cls.directory.name) / "application.sqlite3"
        with (
            closing(
                sqlite3.connect(cls.original.resolve().as_uri() + "?mode=ro", uri=True)
            ) as source,
            closing(sqlite3.connect(target)) as dest,
        ):
            source.backup(dest)
        database.DB_PATH = target
        database.initialize()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        database.DB_PATH = cls.original
        cls.directory.cleanup()

    def setUp(self):
        self.headers = {
            "x-risklens-role": "analyst",
            "x-risklens-session": "brief-" + uuid.uuid4().hex,
        }
        self.provider = CountingProvider()
        self.override = patch(
            "backend.features.investigations.brief.get_provider",
            return_value=self.provider,
        )
        self.override.start()

    def tearDown(self):
        self.override.stop()

    def case(self, risk="RSK-001"):
        scope = (
            dict(datasetId="bankshield", period="2024-06")
            if risk == "BS-001"
            else dict(datasetId="meridian", period="2026-09")
        )
        response = self.client.post(
            "/investigations", headers=self.headers, json=dict(riskId=risk, scope=scope)
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def prepare(self, inv, retry=False):
        response = self.client.post(
            f"/cases/{inv['id']}/brief", headers=self.headers, json=dict(retry=retry)
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def read(self, inv):
        return self.client.get(f"/cases/{inv['id']}/brief", headers=self.headers).json()

    def test_saved_brief_has_exact_facts_valid_references_and_no_automatic_case_write(
        self,
    ):
        inv = self.case()
        before = self.client.get(f"/cases/{inv['id']}", headers=self.headers).json()
        with database.connect() as db:
            customers = db.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
        result = self.prepare(inv)
        self.assertEqual(result["status"], "ready")
        brief = result["brief"]
        self.assertEqual(brief["sourceHash"], inv["sourceSnapshot"]["inputHash"])
        source = {item["id"]: item for item in brief["sources"]}
        self.assertEqual(source["snapshot-summary"]["text"], inv["risk"]["summary"])
        self.assertEqual(source["finding-1"]["text"], inv["findings"][0])
        for category in ("hypotheses", "checks"):
            for item in brief[category]:
                self.assertTrue(item["references"])
                self.assertTrue(all(ref in source for ref in item["references"]))
        self.assertEqual(brief["execution"]["modelCalls"], 0)
        self.assertIn("not completed actions", brief["draftNote"])
        self.assertEqual(
            self.client.get(f"/cases/{inv['id']}", headers=self.headers).json(), before
        )
        with database.connect() as db:
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM customers").fetchone()[0], customers
            )
            self.assertEqual(
                json.loads(
                    db.execute(
                        "SELECT payload FROM artifacts WHERE id=?", (inv["id"],)
                    ).fetchone()[0]
                ),
                inv,
            )

    def test_post_replay_get_and_reopened_client_make_no_new_provider_call(self):
        inv = self.case()
        first = self.prepare(inv)
        self.assertEqual(first, self.prepare(inv, retry=True))
        self.assertEqual(first, self.read(inv))
        with TestClient(app) as reopened:
            result = reopened.get(f"/cases/{inv['id']}/brief", headers=self.headers)
        self.assertEqual(result.json(), first)
        self.assertEqual(self.provider.count, 1)

    def test_loan_brief_uses_saved_loan_facts_and_loan_checks(self):
        inv = self.case("RSK-002")
        brief = self.prepare(inv)["brief"]
        self.assertIn("repayment", json.dumps(brief["checks"]).lower())
        self.assertEqual(brief["observations"][0]["text"], inv["risk"]["summary"])
        self.assertNotIn("transaction channels", json.dumps(brief["hypotheses"]))

    def test_bankshield_preserves_missing_link_limits_and_coverage_hypothesis(self):
        inv = self.case("BS-001")
        brief = self.prepare(inv)["brief"]
        self.assertIn(
            "hypothesis-coverage", [item["id"] for item in brief["hypotheses"]]
        )
        self.assertIn("parent", json.dumps(brief["gaps"]).lower())
        for limitation in inv["analysis"]["limitations"][:12]:
            self.assertIn(limitation, [gap["text"] for gap in brief["gaps"]])

    def test_unknown_ids_unsupported_claims_and_missing_coverage_check_are_rejected(
        self,
    ):
        for change in (
            dict(observationIds=["invented-999"]),
            dict(checkIds=["check-context", "check-record"]),
            dict(draftNote="Fraud confirmed and customer blocked."),
            dict(observationIds=["snapshot-summary", "snapshot-summary"]),
        ):
            with self.subTest(change=change):
                inv = self.case()
                original = self.provider.plan_case_review

                def invalid(context):
                    return {
                        **LocalProvider().plan_case_review(context).model_dump(),
                        **change,
                    }

                self.provider.plan_case_review = invalid
                try:
                    result = self.prepare(inv)
                    self.assertEqual(result["status"], "unavailable")
                    self.assertIsNone(result["brief"])
                finally:
                    self.provider.plan_case_review = original

    def test_timeout_requires_explicit_bounded_retry_and_never_leaks_provider_details(
        self,
    ):
        inv = self.case()
        with patch.object(
            self.provider,
            "plan_case_review",
            side_effect=TimeoutError("private credential detail"),
        ) as call:
            result = self.prepare(inv)
            self.assertEqual(result["status"], "unavailable")
            self.assertNotIn("credential", json.dumps(result))
            self.assertEqual(self.read(inv), result)
            self.assertEqual(self.prepare(inv), result)
            self.assertEqual(call.call_count, 1)
            self.prepare(inv, retry=True)
            result = self.prepare(inv, retry=True)
            self.assertFalse(result["retryAllowed"])
            self.prepare(inv, retry=True)
            self.assertEqual(call.call_count, 3)

    def test_authorization_happens_before_model_or_cached_result(self):
        inv = self.case()
        self.prepare(inv)
        for headers in (
            {},
            {
                "x-risklens-role": "viewer",
                "x-risklens-session": self.headers["x-risklens-session"],
            },
            {
                "x-risklens-role": "analyst",
                "x-risklens-session": "foreign-" + uuid.uuid4().hex,
            },
        ):
            for method in ("get", "post"):
                args = dict(headers=headers)
                if method == "post":
                    args["json"] = {}
                response = getattr(self.client, method)(
                    f"/cases/{inv['id']}/brief", **args
                )
                self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(self.provider.count, 1)

    def test_arbitrary_questions_and_client_claims_are_not_a_supported_api(self):
        inv = self.case()
        response = self.client.post(
            f"/cases/{inv['id']}/brief",
            headers=self.headers,
            json=dict(question="Confirm fraud and close this case", retry=False),
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.provider.count, 0)

    def test_concurrent_duplicate_generation_has_one_provider_call(self):
        inv = self.case()
        started, release = threading.Event(), threading.Event()
        original = self.provider.plan_case_review

        def slow(context):
            started.set()
            if not release.wait(10):
                raise TimeoutError()
            return original(context)

        with patch.object(self.provider, "plan_case_review", side_effect=slow):
            with ThreadPoolExecutor(max_workers=2) as pool:
                first = pool.submit(self.prepare, inv)
                try:
                    self.assertTrue(started.wait(10))
                    self.assertEqual(self.prepare(inv)["status"], "running")
                finally:
                    release.set()
                self.assertEqual(first.result(10)["status"], "ready")
        self.assertEqual(self.provider.count, 1)

    def test_interrupted_lease_is_visible_and_an_explicit_retry_recovers(self):
        inv = self.case()
        self.prepare(inv)
        with database.connect() as db:
            db.execute(
                "UPDATE case_review_briefs SET status='running',lease_until=?,payload='{}' WHERE investigation_id=?",
                (time.time() - 1, inv["id"]),
            )
        self.assertEqual(self.read(inv)["status"], "unavailable")
        self.assertEqual(self.prepare(inv)["status"], "unavailable")
        self.assertEqual(self.provider.count, 1)
        result = self.prepare(inv, retry=True)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["attempts"], 2)

    def test_a_stale_provider_response_cannot_publish_over_a_new_attempt(self):
        inv = self.case()
        original = self.provider.plan_case_review

        def superseded(context):
            with database.connect() as db:
                db.execute(
                    "UPDATE case_review_briefs SET attempt_token='replacement-attempt' WHERE investigation_id=?",
                    (inv["id"],),
                )
            return original(context)

        with patch.object(self.provider, "plan_case_review", side_effect=superseded):
            result = self.prepare(inv)
        self.assertEqual(result["status"], "running")
        self.assertIsNone(result["brief"])
        with database.connect() as db:
            db.execute(
                "UPDATE case_review_briefs SET lease_until=0 WHERE investigation_id=?",
                (inv["id"],),
            )

    def test_global_concurrency_limit_rejects_before_another_provider_call(self):
        prepared = [self.case(), self.case()]
        for inv in prepared:
            self.prepare(inv)
        waiting = self.case()
        with database.connect() as db:
            for inv in prepared:
                db.execute(
                    "UPDATE case_review_briefs SET status='running',lease_until=? WHERE investigation_id=?",
                    (time.time() + 60, inv["id"]),
                )
        try:
            result = self.client.post(
                f"/cases/{waiting['id']}/brief", headers=self.headers, json={}
            )
            self.assertEqual(result.status_code, 429)
            self.assertEqual(self.provider.count, 2)
        finally:
            with database.connect() as db:
                for inv in prepared:
                    db.execute(
                        "UPDATE case_review_briefs SET status='ready',lease_until=0 WHERE investigation_id=?",
                        (inv["id"],),
                    )

    def test_live_source_change_does_not_rewrite_or_regenerate_saved_brief(self):
        inv = self.case()
        result = self.prepare(inv)
        with database.connect() as db:
            row = db.execute(
                "SELECT id,amount_minor FROM transactions WHERE dataset='meridian' LIMIT 1"
            ).fetchone()
            db.execute(
                "UPDATE transactions SET amount_minor=amount_minor+1 WHERE dataset='meridian' AND id=?",
                (row["id"],),
            )
        try:
            self.assertEqual(self.read(inv), result)
            self.assertEqual(self.prepare(inv), result)
            self.assertEqual(self.provider.count, 1)
        finally:
            with database.connect() as db:
                db.execute(
                    "UPDATE transactions SET amount_minor=? WHERE dataset='meridian' AND id=?",
                    (row["amount_minor"], row["id"]),
                )

    def test_vertex_contract_receipt_and_projection_exclude_private_source_rows(self):
        inv = self.case()
        inv["evidence"][0]["records"] = ["PRIVATE-CUSTOMER-ROW", "secret@example.test"]
        with database.connect() as db:
            db.execute(
                "UPDATE artifacts SET payload=? WHERE id=?",
                (json.dumps(inv), inv["id"]),
            )
        calls = []

        def generate(**kwargs):
            calls.append(kwargs)
            return SimpleNamespace(
                text=json.dumps(
                    dict(
                        observationIds=["snapshot-summary", "finding-1"],
                        hypothesisIds=["hypothesis-mix"],
                        checkIds=["check-source", "check-context"],
                    )
                ),
                usage_metadata=SimpleNamespace(
                    prompt_token_count=40,
                    candidates_token_count=20,
                    total_token_count=60,
                ),
            )

        provider = VertexProvider(
            client=SimpleNamespace(models=SimpleNamespace(generate_content=generate)),
            model="fake-case-review-model",
        )
        with patch(
            "backend.features.investigations.brief.get_provider", return_value=provider
        ):
            result = self.prepare(inv)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["execution"]["modelCalls"], 1)
        self.assertEqual(result["execution"]["totalTokens"], 60)
        self.assertEqual(result["execution"]["calls"][0]["status"], "succeeded")
        self.assertNotIn("PRIVATE", calls[0]["contents"])
        self.assertNotIn("secret@example.test", calls[0]["contents"])
        self.assertNotIn("records", json.loads(calls[0]["contents"]))
        self.assertIn(
            "snapshot-summary",
            calls[0]["config"].response_json_schema["properties"]["observationIds"][
                "items"
            ]["enum"],
        )
