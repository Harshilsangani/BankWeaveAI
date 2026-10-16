import assert from "node:assert/strict";
import test from "node:test";
import { reportFilename, researchPdfFilename } from "../../src/features/reports/filename";

test("report names use IST across a date boundary and distinguish repeated downloads", () => {
  const now = new Date("2026-10-15T20:00:05Z");
  const first = reportFilename("meridian", "Loan Research", "pdf", now);
  assert.match(
    first,
    /^BankWeave_Meridian_Loan_Research_2026-10-16_01-30-05_IST_[a-f0-9]{8}\.pdf$/
  );
  assert.notEqual(first, reportFilename("meridian", "Loan Research", "pdf", now));
  assert.match(
    reportFilename("bankshield", "Investigation / review: report", "html", now),
    /^BankWeave_BankShield_Investigation_review_report_2026-10-16_01-30-05_IST_[a-f0-9]{8}\.html$/
  );
  assert.equal(
    researchPdfFilename("Meridian demo", "meridian", now),
    "Meridian_demo_2026-10-16_01-30-05_IST.pdf"
  );
  assert.equal(
    researchPdfFilename(undefined, "bankshield", now),
    "BankShield_2026-10-16_01-30-05_IST.pdf"
  );
});
