import {
  baselineMonth,
  branches,
  customers,
  loans,
  months,
  snapshotMonth,
  transactions,
} from "@/data/banking";
import type { Month } from "@/data/banking";
import { change, money, number, percent } from "@/lib/utils";
import type { ChartPoint, Evidence, Metric, QueryContext, TableData } from "@/types";

export function analyze(context: QueryContext, month: Month = snapshotMonth) {
  const branchIds = branches
    .filter(
      (b) => !context.region || b.region === context.region || b.region === context.comparison
    )
    .map((b) => b.id);
  const tx = transactions.filter(
    (t) =>
      branchIds.includes(t.branchId) &&
      t.month === month &&
      (!context.minAmount || t.amount > context.minAmount) &&
      (!context.newDeviceOnly || t.newDevice)
  );
  const loanSet = loans.filter((l) => branchIds.includes(l.branchId));
  const flagged = tx.filter((t) => t.flagged);
  const defaults = loanSet.filter((l) => l.defaultMonths.includes(month));
  const affected = context.domain === "fraud" ? flagged.length : defaults.length;
  const total = context.domain === "fraud" ? tx.length : loanSet.length;
  const exposure =
    context.domain === "fraud"
      ? flagged.reduce((s, t) => s + t.amount, 0)
      : defaults.reduce((s, l) => s + l.amount, 0);
  return {
    tx,
    flagged,
    defaults,
    loanSet,
    affected,
    total,
    exposure,
    rate: total ? (affected / total) * 100 : 0,
  };
}
export function metrics(context: QueryContext): Metric[] {
  const current = analyze(context),
    previous = analyze(context, baselineMonth);
  const delta = change(current.affected, previous.affected);
  return [
    {
      label: context.domain === "fraud" ? "Flagged transactions" : "Defaulted loans",
      value: number(current.affected),
      change: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`,
      direction: delta >= 0 ? "up" : "down",
      detail: "vs. August 2026",
      sparkline: trend(context).map((p) => p.value),
    },
    {
      label: "Exposure under review",
      value: money(current.exposure),
      change: "At risk",
      direction: "neutral",
      detail: "Flagged value · not confirmed loss",
    },
    {
      label: context.domain === "fraud" ? "Flagged transaction rate" : "Loan default rate",
      value: percent(current.rate),
      change: `${(current.rate - previous.rate).toFixed(2)} pp`,
      direction: current.rate >= previous.rate ? "up" : "down",
      detail: `${number(current.total)} records in scope`,
    },
  ];
}
export function trend(context: QueryContext): ChartPoint[] {
  return months.map((name) => ({
    name,
    value: analyze(context, name).affected,
    baseline: context.domain === "fraud" ? 833 : 648,
  }));
}
export function regions(context: QueryContext): ChartPoint[] {
  return branches
    .filter(
      (b) => !context.region || b.region === context.region || b.region === context.comparison
    )
    .map((b) => ({
      name: b.region,
      value: analyze({ ...context, region: b.region, comparison: undefined }).affected,
    }));
}
export function segmentTable(context: QueryContext): TableData {
  return {
    columns: [
      "Region / branch",
      context.domain === "fraud" ? "Flagged" : "Defaults",
      "Rate",
      "Exposure",
      "MoM change",
    ],
    rows: branches
      .filter(
        (b) => !context.region || b.region === context.region || b.region === context.comparison
      )
      .map((b) => {
        const scope = { ...context, region: b.region, comparison: undefined };
        const current = analyze(scope),
          prior = analyze(scope, baselineMonth);
        const delta = change(current.affected, prior.affected);
        return [
          b.region,
          current.affected,
          percent(current.rate),
          money(current.exposure),
          `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`,
        ];
      }),
  };
}
export function evidence(context: QueryContext): Evidence[] {
  const a = analyze(context),
    prior = analyze(context, baselineMonth);
  return [
    {
      id: `EV-${context.domain}-01`,
      title: "Reconciled source records",
      source: `${context.domain === "fraud" ? "transactions + fraud_alerts" : "loans + customers"} · September 2026`,
      detail: `${number(a.affected)} flagged/defaulted records out of ${number(a.total)} in scope. August comparison: ${number(prior.affected)}. Records are synthetic. Region filters use branch location, not customer residence.`,
      records:
        context.domain === "fraud"
          ? a.flagged
              .slice(0, 6)
              .map((t) => `${t.id} · ${money(t.amount)} · ${t.channel} · score ${t.riskScore}`)
          : a.defaults.slice(0, 6).map((l) => `${l.id} · ${l.type} · ${money(l.amount)}`),
    },
    {
      id: `EV-${context.domain}-02`,
      title: "Analysis methodology",
      source: "BankWeave demo analytics · deterministic aggregation",
      detail:
        context.domain === "fraud"
          ? "Exposure is the sum of flagged transaction amounts, not a prediction of financial loss. Flagged rate = flagged transactions / all transactions in the same scope. Alerts are unconfirmed."
          : "Default rate = defaulted loans / loans in the selected branch population. Exposure is the outstanding principal proxy in this synthetic dataset, not expected loss.",
      records: [
        `Dataset: ${number(transactions.length)} transactions, ${number(customers.length)} customers, ${number(loans.length)} loans`,
        "Observation window: 01–30 September 2026",
        "Baseline window: 01–31 August 2026",
      ],
    },
  ];
}
export function finding(context: QueryContext): string {
  const current = analyze(context),
    previous = analyze(context, baselineMonth);
  if (context.domain === "fraud") {
    const newDevice = current.flagged.filter((t) => t.newDevice).length;
    return `${newDevice} of ${current.affected} flagged transactions involve newly registered devices (${percent(current.affected ? (newDevice / current.affected) * 100 : 0)}). Flagged volume changed from ${previous.affected} to ${current.affected}. This is an association that warrants review; it does not establish fraud or causation.`;
  }
  const unsecured = current.defaults.filter((l) => l.type === "Unsecured").length;
  return `${unsecured} of ${current.affected} defaults are in unsecured products. Defaults changed from ${previous.affected} to ${current.affected} on a fixed loan population. Review repayment histories and product concentration before drawing causal conclusions.`;
}
export function contributionFinding(context: QueryContext): string {
  const deltas = branches
    .filter(
      (b) => !context.region || b.region === context.region || b.region === context.comparison
    )
    .map((b) => {
      const scope = { ...context, region: b.region, comparison: undefined };
      const now = analyze(scope),
        before = analyze(scope, baselineMonth);
      return {
        name: b.region,
        current: now.affected,
        previous: before.affected,
        delta: now.affected - before.affected,
      };
    })
    .sort((a, b) => b.delta - a.delta);
  const leader = deltas[0],
    total = analyze(context).affected - analyze(context, baselineMonth).affected;
  if (!leader)
    return "No source records match this scope. Broaden the filters to continue investigating.";
  return `${leader.name} is the largest contributor in this scope: ${leader.current} affected records compared with ${leader.previous} in August (${leader.delta >= 0 ? "+" : ""}${leader.delta}). The net change across the selected population is ${total >= 0 ? "+" : ""}${total} records.${leader.delta > total ? " Decreases elsewhere partly offset this increase." : ""} Inspect source records to validate the contributing factors.`;
}
