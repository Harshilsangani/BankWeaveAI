import test from "node:test";
import assert from "node:assert/strict";
import {
  accounts,
  baselineMonth,
  branches,
  customers,
  fraudAlerts,
  loans,
  months,
  parseMonth,
  snapshotMonth,
  transactions,
} from "../data/banking";
import { analyze, segmentTable } from "./fixtures/analytics";
import {
  buildInvestigation,
  buildRisks,
  calculateScenario,
  mockService,
  resolveContext,
} from "./fixtures/mock-service";
import { reportHtml } from "./fixtures/report";

test("synthetic foreign keys and fraud alert records reconcile", () => {
  const customerIds = new Set(customers.map((c) => c.id)),
    branchIds = new Set(branches.map((b) => b.id));
  const accountMap = new Map(accounts.map((a) => [a.id, a])),
    txMap = new Map(transactions.map((t) => [t.id, t]));
  for (const tx of transactions) {
    assert.ok(customerIds.has(tx.customerId));
    assert.ok(branchIds.has(tx.branchId));
    assert.equal(accountMap.get(tx.accountId)?.customerId, tx.customerId);
    assert.equal(customers.find((c) => c.id === tx.customerId)?.branchId, tx.branchId);
  }
  for (const loan of loans) assert.ok(customerIds.has(loan.customerId));
  for (const alert of fraudAlerts) assert.equal(txMap.get(alert.transactionId)?.flagged, true);
  assert.equal(fraudAlerts.length, transactions.filter((t) => t.flagged).length);
});
test("September risk story reconciles with August and regional totals", () => {
  const current = analyze({ domain: "fraud" }),
    previous = analyze({ domain: "fraud" }, "Aug");
  assert.equal(current.affected, 1091);
  assert.equal(previous.affected, 833);
  const segments = segmentTable({ domain: "fraud" });
  assert.equal(
    segments.rows.reduce((sum, row) => sum + Number(row[1]), 0),
    current.affected
  );
  assert.equal(analyze({ domain: "loans" }).affected, 765);
  assert.equal(analyze({ domain: "loans" }, "Aug").affected, 648);
  assert.equal(
    buildRisks()[0].estimatedExposure,
    current.flagged.reduce((sum, t) => sum + t.amount, 0)
  );
  assert.equal(buildInvestigation("RSK-001").risk.affectedRecords, current.affected);
});
test("follow-ups retain region and domain, comparison expands correctly, reset removes scope", () => {
  let ctx = resolveContext("Show loan defaults");
  ctx = resolveContext("Why?", ctx);
  assert.equal(ctx.domain, "loans");
  ctx = resolveContext("Only Ahmedabad", ctx);
  assert.equal(ctx.region, "Ahmedabad");
  ctx = resolveContext("Compare it to Surat", ctx);
  assert.equal(ctx.region, "Ahmedabad");
  assert.equal(ctx.comparison, "Surat");
  assert.equal(segmentTable(ctx).rows.length, 2);
  ctx = resolveContext("Show all regions", ctx);
  assert.equal(ctx.region, undefined);
  assert.equal(ctx.comparison, undefined);
  ctx = resolveContext("Show suspicious transactions above ₹2 lakh", ctx);
  assert.equal(ctx.domain, "fraud");
  assert.equal(ctx.minAmount, 200000);
  assert.ok(analyze(ctx).flagged.every((t) => t.amount > 200000));
});
test("scenario zero and full coverage bound exposure; invalid values fail", () => {
  const base = { riskId: "RSK-001", coverage: 80, effectiveness: 65, friction: 5 };
  const zero = calculateScenario({ ...base, coverage: 0 });
  assert.equal(zero.projected, zero.baseline);
  assert.equal(zero.challenged, 0);
  const full = calculateScenario({ ...base, coverage: 100, effectiveness: 100 });
  assert.equal(full.projected, 0);
  const scenario = calculateScenario(base);
  assert.ok(Math.abs(scenario.projected - scenario.baseline * 0.48) < 0.01);
  assert.ok(scenario.abandoned <= scenario.challenged);
  assert.throws(() => calculateScenario({ ...base, coverage: -1 }));
  assert.throws(() => calculateScenario({ ...base, riskId: "RSK-002" }));
  assert.throws(() => buildInvestigation("invalid"));
});
test("device cluster and selected regional scope carry through investigation and scenario", () => {
  const cluster = buildInvestigation("RSK-003");
  assert.equal(cluster.risk.affectedRecords, 532);
  const selected = { domain: "fraud" as const, region: "Surat", riskId: "RSK-001" };
  const inv = buildInvestigation("RSK-001", selected);
  assert.equal(inv.risk.affectedRecords, 208);
  assert.equal(inv.segments.rows.length, 1);
  const result = calculateScenario({
    riskId: "RSK-001",
    scope: selected,
    coverage: 80,
    effectiveness: 65,
    friction: 5,
  });
  assert.equal(result.baseline, inv.risk.estimatedExposure);
  assert.equal(result.affected, 208);
  assert.equal(result.input.scope?.region, "Surat");
});
test("only the six snapshot months parse; windows stay pinned", () => {
  assert.equal(months.length, 6);
  assert.equal(snapshotMonth, "Sep");
  assert.equal(baselineMonth, "Aug");
  for (const month of months) assert.equal(parseMonth(month), month);
  assert.throws(() => parseMonth("Oct"));
  assert.throws(() => parseMonth("sep"));
  assert.throws(() => parseMonth(""));
  assert.throws(() => parseMonth(undefined));
  assert.throws(() => parseMonth(8));
});
test("analyst unsupported inputs do not manufacture an answer; report is escaped and labeled", async () => {
  const response = await mockService.sendAnalystQuery("Write a poem");
  assert.equal(response.title, "Explore the available demo data");
  const report = await mockService.generateReport(buildInvestigation("RSK-001"));
  const html = reportHtml({ ...report, title: "<script>alert('x')</script>" });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("SYNTHETIC DATA"));
});
