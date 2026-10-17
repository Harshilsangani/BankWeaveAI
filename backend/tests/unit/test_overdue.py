"""Cutoff and reconciliation cases independent of fixture default labels."""

import sqlite3
import unittest

from backend.features.risk.overdue import calculate, check, cutoff, load


class OverdueCalculationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        CREATE TABLE loans(dataset TEXT,id TEXT,customer_id TEXT,branch_id TEXT,loan_type TEXT,principal_minor INTEGER,default_months TEXT);
        CREATE TABLE customer_master(dataset TEXT,id TEXT,branch_id TEXT,region TEXT);
        CREATE TABLE loan_installments(dataset TEXT,id TEXT,loan_id TEXT,due_on TEXT,principal_due_minor INTEGER,source_version TEXT);
        CREATE TABLE loan_payments(dataset TEXT,id TEXT,installment_id TEXT,paid_on TEXT,principal_paid_minor INTEGER,source TEXT);
        """)
        self.loan("L1")

    def tearDown(self):
        self.db.close()

    def loan(self, key, region="Ahmedabad", dataset="meridian", principal=1000000):
        self.db.execute(
            "INSERT INTO loans VALUES(?,?,?,?,?,?,?)",
            (dataset, key, "C-" + key, "B-" + region, "Unsecured", principal, "[]"),
        )
        self.db.execute(
            "INSERT INTO customer_master VALUES(?,?,?,?)",
            (dataset, "C-" + key, "B-" + region, region),
        )

    def due(
        self, key="I1", loan="L1", due="2026-09-15", amount=200000, dataset="meridian"
    ):
        self.db.execute(
            "INSERT INTO loan_installments VALUES(?,?,?,?,?,?)",
            (dataset, key, loan, due, amount, "test-ledger"),
        )

    def pay(
        self,
        key="P1",
        installment="I1",
        paid="2026-09-15",
        amount=200000,
        dataset="meridian",
    ):
        self.db.execute(
            "INSERT INTO loan_payments VALUES(?,?,?,?,?,?)",
            (dataset, key, installment, paid, amount, "test-payment"),
        )

    def value(self, period="2026-09", **scope):
        return calculate(
            load(
                self.db,
                dict(datasetId="meridian", domain="loans", period=period, **scope),
            ),
            period,
        )

    def test_unpaid_amount_is_scheduled_principal_not_original_balance(self):
        self.due()
        value = self.value()
        self.assertEqual(value["affected"], 1)
        self.assertEqual(value["overdueMinor"], 200000)
        self.assertEqual(value["maxDaysPastDue"], 15)
        self.assertEqual(value["rows"][0]["installments"][0]["id"], "I1")

    def test_fully_paid_and_paid_late_before_cutoff_are_clear(self):
        self.due()
        self.pay(paid="2026-09-29")
        self.assertEqual(self.value()["affected"], 0)
        self.assertEqual(check(self.value())["status"], "clear")

    def test_future_payment_does_not_clear_historical_overdue(self):
        self.due()
        self.pay(paid="2026-10-01")
        self.assertEqual(self.value()["overdueMinor"], 200000)
        self.assertEqual(self.value("2026-10")["affected"], 0)
        self.assertEqual(self.value()["rows"][0]["installments"][0]["payments"], [])

    def test_payment_on_cutoff_is_included(self):
        self.due()
        self.pay(paid="2026-09-30")
        self.assertEqual(self.value()["affected"], 0)

    def test_partial_and_split_payments_reconcile_once(self):
        self.due(amount=500000)
        self.pay(amount=100000)
        self.pay("P2", amount=50000)
        value = self.value()
        item = value["rows"][0]["installments"][0]
        self.assertEqual(value["overdueMinor"], 350000)
        self.assertEqual(item["paidMinor"], 150000)
        self.assertEqual({p["id"] for p in item["payments"]}, {"P1", "P2"})
        self.assertEqual(item["dueMinor"] - item["paidMinor"], item["unpaidMinor"])

    def test_overpayment_cannot_pay_another_installment(self):
        self.due()
        self.due("I2", amount=250000)
        self.pay(amount=500000)
        value = self.value()
        self.assertEqual(value["overdueMinor"], 250000)
        self.assertEqual(value["rows"][0]["installments"][0]["id"], "I2")

    def test_future_and_cutoff_day_installments_do_not_trigger(self):
        self.due(due="2026-09-30")
        self.due("I2", due="2026-10-01")
        self.assertEqual(self.value()["affected"], 0)

    def test_age_threshold_is_inclusive_and_amount_threshold_is_inclusive(self):
        self.due(due="2026-09-16", amount=100000)
        self.assertEqual(self.value()["affected"], 1)
        self.db.execute("UPDATE loan_installments SET due_on='2026-09-17'")
        self.assertEqual(self.value()["affected"], 0)
        self.db.execute(
            "UPDATE loan_installments SET due_on='2026-09-16',principal_due_minor=99999"
        )
        self.assertEqual(self.value()["affected"], 0)

    def test_small_old_balances_combine_only_within_one_loan(self):
        self.due(amount=60000)
        self.due("I2", amount=40000)
        self.assertEqual(self.value()["overdueMinor"], 100000)
        self.assertEqual(self.value()["affected"], 1)

    def test_loan_count_is_distinct_not_installment_count(self):
        self.due()
        self.due("I2")
        self.assertEqual(self.value()["affected"], 1)
        self.assertEqual(len(self.value()["rows"][0]["installments"]), 2)

    def test_absent_schedule_is_insufficient_not_clear(self):
        value = self.value()
        self.assertEqual(value["missingLoans"], 1)
        self.assertEqual(check(value)["status"], "insufficient")

    def test_missing_other_loans_do_not_hide_known_signal(self):
        self.loan("L2")
        self.due()
        value = self.value()
        self.assertEqual(value["total"], 1)
        self.assertEqual(value["scopedLoans"], 2)
        self.assertEqual(value["missingLoans"], 1)
        self.assertEqual(check(value)["status"], "matched")
        self.assertIn("incomplete", check(value)["reason"])

    def test_invalid_due_dates_quarantine_loan(self):
        self.due(due="2026-02-30")
        value = self.value()
        self.assertEqual(value["invalidLoans"], 1)
        self.assertEqual(check(value)["status"], "insufficient")

    def test_invalid_payment_date_cannot_be_assumed_missing(self):
        self.due()
        self.pay(paid="not-a-date")
        value = self.value()
        self.assertEqual(value["invalidLoans"], 1)
        self.assertEqual(value["affected"], 0)

    def test_negative_payment_or_due_amount_is_not_a_valid_signal(self):
        self.due()
        self.pay(amount=-1)
        self.assertEqual(check(self.value())["status"], "insufficient")
        self.db.execute("DELETE FROM loan_payments")
        self.db.execute("UPDATE loan_installments SET principal_due_minor=-1")
        self.assertEqual(check(self.value())["status"], "insufficient")

    def test_fractional_minor_units_are_invalid(self):
        self.due(amount=100000.5)
        self.assertEqual(self.value()["invalidLoans"], 1)

    def test_future_invalid_amount_does_not_affect_past_window(self):
        self.due()
        self.pay(paid="2026-10-01", amount=-1)
        self.assertEqual(self.value()["affected"], 1)
        self.assertEqual(self.value()["invalidLoans"], 0)

    def test_unlinked_payment_or_schedule_prevents_false_clear(self):
        self.due()
        self.pay()
        self.pay("ORPHAN", installment="UNKNOWN")
        self.assertEqual(self.value()["orphanRecords"], 1)
        self.assertEqual(check(self.value())["status"], "insufficient")

    def test_customer_and_region_scopes_and_dataset_isolation(self):
        self.due()
        self.loan("L2", "Surat")
        self.due("I2", "L2")
        self.loan("OTHER", dataset="bankshield")
        self.due("IO", "OTHER", dataset="bankshield")
        self.assertEqual(self.value()["affected"], 2)
        self.assertEqual(self.value(region="Surat")["rows"][0]["loanId"], "L2")
        self.assertEqual(self.value(customerId="C-L1")["affected"], 1)
        self.assertEqual(
            self.value(region="Ahmedabad", comparison="Surat")["affected"], 2
        )

    def test_priority_order_is_age_then_unpaid_amount_then_id(self):
        self.due(due="2026-08-01", amount=100000)
        self.loan("L2")
        self.due("I2", "L2", due="2026-09-01", amount=999999)
        self.loan("L3")
        self.due("I3", "L3", due="2026-08-01", amount=200000)
        self.assertEqual(
            [r["loanId"] for r in self.value()["rows"]], ["L3", "L1", "L2"]
        )

    def test_leap_year_and_year_boundary_cutoffs(self):
        self.assertEqual(cutoff("2024-02").isoformat(), "2024-02-29")
        self.assertEqual(cutoff("2026-12").isoformat(), "2026-12-31")
        self.due(due="2024-02-15")
        self.assertEqual(self.value("2024-02")["maxDaysPastDue"], 14)

    def test_fixture_marker_edits_do_not_change_repayment_result(self):
        self.due()
        before = self.value()
        self.db.execute('UPDATE loans SET default_months=\'["Jan","Sep"]\'')
        self.assertEqual(before, self.value())

    def test_first_month_signal_needs_no_growth_baseline(self):
        self.due(due="2026-04-15")
        result = check(self.value("2026-04"))
        self.assertEqual(result["status"], "matched")
        self.assertIsNone(result["baselineCount"])
        self.assertIsNone(result["increasePct"])


if __name__ == "__main__":
    unittest.main()
