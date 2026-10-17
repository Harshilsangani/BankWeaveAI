"""Overdue detection, frozen case/policy/report and access acceptance on copied data."""

import json
import sqlite3
import tempfile
import unittest
import uuid
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import app
from backend.core import database
from backend.features.investigations.brief_context import context, render_selection
from backend.features.risk.overdue import build, cutoff
from backend.integrations.ai import LocalProvider


class OverdueWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="overdue-workflow-")
        cls.original = database.DB_PATH
        cls.base = Path(cls.temp.name) / "base.sqlite3"
        with (
            closing(
                sqlite3.connect(cls.original.resolve().as_uri() + "?mode=ro", uri=True)
            ) as src,
            closing(sqlite3.connect(cls.base)) as dest,
        ):
            src.backup(dest)

    @classmethod
    def tearDownClass(cls):
        database.DB_PATH = cls.original
        cls.temp.cleanup()

    def setUp(self):
        self.path = Path(self.temp.name) / (uuid.uuid4().hex + ".sqlite3")
        with (
            closing(sqlite3.connect(self.base)) as src,
            closing(sqlite3.connect(self.path)) as dest,
        ):
            src.backup(dest)
        database.DB_PATH = self.path
        database.initialize()
        self.client = TestClient(app)
        self.headers = {
            "x-risklens-role": "analyst",
            "x-risklens-session": "overdue-" + uuid.uuid4().hex,
        }
        self.scope = dict(
            datasetId="meridian", domain="loans", period="2026-09", riskId="RSK-004"
        )

    def tearDown(self):
        self.client.close()
        database.DB_PATH = self.original
        for suffix in ("", "-wal", "-shm"):
            self.path.with_name(self.path.name + suffix).unlink(missing_ok=True)

    def case(self, **scope):
        response = self.client.post(
            "/investigations",
            headers=self.headers,
            json=dict(riskId="RSK-004", scope={**self.scope, **scope}),
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_real_fixture_agrees_with_independent_sql_for_several_cutoffs(self):
        for period in ("2026-04", "2026-07", "2026-08", "2026-09"):
            at = cutoff(period).isoformat()
            with database.connect() as db:
                rows = db.execute(
                    """WITH balances AS (
                  SELECT i.loan_id,MAX(0,i.principal_due_minor-COALESCE(SUM(CASE WHEN p.paid_on<=? THEN p.principal_paid_minor ELSE 0 END),0)) unpaid
                  FROM loan_installments i LEFT JOIN loan_payments p ON p.dataset=i.dataset AND p.installment_id=i.id
                  WHERE i.dataset='meridian' AND julianday(?)-julianday(i.due_on)>=14 GROUP BY i.id
                ) SELECT loan_id,SUM(unpaid) amount FROM balances GROUP BY loan_id HAVING amount>=100000""",
                    (at, at),
                ).fetchall()
            data = build({**self.scope, "period": period})
            self.assertEqual(data["current"]["affected"], len(rows))
            self.assertEqual(
                data["current"]["overdueMinor"], sum(row["amount"] for row in rows)
            )
            self.assertEqual(
                sum(row["overdueMinor"] for row in data["current"]["rows"]),
                data["current"]["overdueMinor"],
            )

    def test_detection_is_versioned_replayed_and_never_calls_ai(self):
        with patch(
            "backend.integrations.ai.get_provider",
            side_effect=AssertionError("No model allowed"),
        ):
            first = self.client.post(
                "/detectors/run",
                headers=self.headers,
                json=dict(datasetId="meridian", period="2026-09"),
            )
        self.assertEqual(first.status_code, 200, first.text)
        value = first.json()
        self.assertEqual(value["rulesVersion"], "snapshot-rules-v3")
        self.assertEqual(value["modelCalls"], 0)
        self.assertEqual(len(value["checks"]), 4)
        event = next(item for item in value["events"] if item["id"] == "RSK-004")
        self.assertEqual(event["category"], "loans")
        self.assertEqual(event["detection"]["scope"]["riskId"], "RSK-004")
        second = self.client.post(
            "/detectors/run",
            headers=self.headers,
            json=dict(datasetId="meridian", period="2026-09"),
        ).json()
        self.assertEqual(value["id"], second["id"])
        self.assertTrue(second["replayed"])

    def test_latest_read_does_not_create_detector_run(self):
        with database.connect() as db:
            before = db.execute("SELECT COUNT(*) FROM detector_runs").fetchone()[0]
        self.assertEqual(
            self.client.get(
                "/detectors/latest?datasetId=meridian&period=2026-09",
                headers=self.headers,
            ).status_code,
            200,
        )
        with database.connect() as db:
            self.assertEqual(
                before, db.execute("SELECT COUNT(*) FROM detector_runs").fetchone()[0]
            )

    def test_case_freezes_repayment_references_and_policy_versions(self):
        inv = self.case()
        saved = inv["repaymentEvidence"]
        self.assertEqual(saved["asOf"], "2026-09-30")
        self.assertEqual(saved["totalLoans"], 765)
        self.assertEqual(len(saved["rows"]), 20)
        self.assertTrue(saved["truncated"])
        self.assertEqual(inv["execution"]["modelCalls"], 0)
        self.assertEqual(
            inv["analysis"]["baseline"], "Not required for the overdue threshold"
        )
        self.assertTrue(inv["policyGuidance"]["sections"])
        for loan in saved["loans"]:
            for item in loan["installments"]:
                self.assertEqual(
                    item["dueMinor"] - item["paidMinor"], item["unpaidMinor"]
                )
                self.assertGreaterEqual(item["daysPastDue"], 14)
                for payment in item["payments"]:
                    self.assertLessEqual(payment["paidOn"], saved["asOf"])
        loaded = self.client.get(
            "/saved-investigations/" + inv["id"], headers=self.headers
        ).json()
        self.assertEqual(saved, loaded["repaymentEvidence"])

    def test_evidence_pages_have_consistent_counts_and_no_duplicate_loans(self):
        pages = []
        for offset in (0, 10):
            response = self.client.post(
                "/evidence",
                headers=self.headers,
                json=dict(scope=self.scope, offset=offset, limit=10),
            )
            self.assertEqual(response.status_code, 200, response.text)
            pages.append(response.json())
        self.assertEqual(pages[0]["total"], 765)
        self.assertEqual(pages[0]["nextOffset"], 10)
        self.assertIn("Overdue principal", pages[0]["columns"])
        ids = [row[0] for page in pages for row in page["rows"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_later_payment_changes_current_evidence_without_rewriting_case(self):
        inv = self.case()
        loan = inv["repaymentEvidence"]["loans"][0]
        item = loan["installments"][0]
        with database.connect() as db:
            db.execute(
                "INSERT INTO loan_payments VALUES(?,?,?,?,?,?)",
                (
                    "meridian",
                    "QA-LATER",
                    item["id"],
                    "2026-10-01",
                    item["unpaidMinor"],
                    "isolated-test",
                ),
            )
        self.assertEqual(build(self.scope)["current"]["affected"], 765)
        with database.connect() as db:
            db.execute(
                "UPDATE loan_payments SET paid_on='2026-09-30' WHERE id='QA-LATER'"
            )
        self.assertEqual(build(self.scope)["current"]["affected"], 764)
        loaded = self.client.get(
            "/saved-investigations/" + inv["id"], headers=self.headers
        ).json()
        self.assertEqual(inv["repaymentEvidence"], loaded["repaymentEvidence"])
        self.assertEqual(
            self.client.get(
                "/cases/" + inv["id"] + "/source", headers=self.headers
            ).json()["state"],
            "changed",
        )

    def test_review_brief_uses_saved_aggregate_and_policy_context_only(self):
        inv = self.case()
        supplied = context(inv)
        selected = LocalProvider().plan_case_review(supplied)
        brief = render_selection(selected, supplied)
        self.assertIn("check-policy", [item["id"] for item in brief["checks"]])
        self.assertTrue(
            any(item["id"].startswith("policy-") for item in supplied["observations"])
        )
        self.assertNotIn("LN-", json.dumps(supplied))
        self.assertNotIn("CUS-", json.dumps(supplied))

    def test_bankshield_and_viewer_write_paths_are_denied(self):
        self.assertEqual(
            self.client.post(
                "/investigations",
                headers=self.headers,
                json=dict(
                    riskId="RSK-004",
                    scope=dict(datasetId="bankshield", period="2024-06"),
                ),
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/investigations",
                headers={**self.headers, "x-risklens-role": "viewer"},
                json=dict(riskId="RSK-004", scope=self.scope),
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/evidence",
                headers=self.headers,
                json=dict(scope={**self.scope, "domain": "fraud"}),
            ).status_code,
            400,
        )

    def test_full_history_resolves_to_latest_cutoff_and_customer_scope_is_kept(self):
        inv = self.case(period="all", customerId="CUS-00001")
        self.assertEqual(inv["scope"]["period"], "2026-09")
        self.assertEqual(inv["scope"]["customerId"], "CUS-00001")
        self.assertTrue(
            all(
                row["customerId"] == "CUS-00001"
                for row in inv["repaymentEvidence"]["loans"]
            )
        )

    def test_report_retains_frozen_evidence_policy_and_review(self):
        inv = self.case()
        case = self.client.get("/cases/" + inv["id"], headers=self.headers).json()
        updated = self.client.patch(
            "/cases/" + inv["id"],
            headers=self.headers,
            json=dict(
                revision=case["revision"],
                status="Resolved",
                note="Reconciled the synthetic due/payment references at cutoff. No collection action taken.",
            ),
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        response = self.client.post(
            "/reports", headers=self.headers, json=dict(investigationId=inv["id"])
        )
        self.assertEqual(response.status_code, 200, response.text)
        report = response.json()
        download = self.client.get(
            "/reports/" + report["id"] + "/download", headers=self.headers
        )
        self.assertEqual(download.status_code, 200, download.text)
        self.assertIn("Frozen overdue-principal evidence", download.text)
        self.assertIn("Related supplied policy guidance", download.text)
        self.assertIn("Reconciled the synthetic", download.text)
        original = download.content
        self.client.patch(
            "/cases/" + inv["id"],
            headers=self.headers,
            json=dict(
                revision=updated.json()["revision"],
                note="A later note must not change an earlier report.",
            ),
        )
        self.assertEqual(
            original,
            self.client.get(
                "/reports/" + report["id"] + "/download", headers=self.headers
            ).content,
        )

    def test_unowned_workspace_cannot_open_saved_case(self):
        inv = self.case()
        foreign = {**self.headers, "x-risklens-session": "other-" + uuid.uuid4().hex}
        self.assertEqual(
            self.client.get(
                "/saved-investigations/" + inv["id"], headers=foreign
            ).status_code,
            403,
        )


if __name__ == "__main__":
    unittest.main()
