const delay = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));
import type { Report } from "@/features/reports/types";
// Reference fixture for deterministic analytics tests; never imported by application routes.
import { baselineMonth, branches, policies } from "../../../demo/banking-data";
import { change, money, number, uid } from "@/shared/lib/utils";
import type { AnalystResponse, ResponseBlock } from "@/features/analyst/types";
import type { Investigation } from "@/features/investigations/types";
import type { QueryContext } from "@/shared/types/scope";
import type { RiskEvent } from "@/features/risk/types";
import type { ScenarioInput, ScenarioResult } from "@/features/reports/legacy-types";
import {
  analyze,
  contributionFinding,
  evidence,
  finding,
  metrics,
  regions,
  segmentTable,
  trend,
} from "./analytics";
type MockAnalysisService = {
  sendAnalystQuery(
    query: string,
    context?: QueryContext,
    scenario?: ScenarioResult
  ): Promise<AnalystResponse>;
  generateReport(investigation: Investigation, scenario?: ScenarioResult): Promise<Report>;
};

export function buildRisks(): RiskEvent[] {
  return [
    {
      id: "RSK-001",
      title: "Card fraud spike",
      category: "fraud" as const,
      severity: "high" as const,
      summary:
        "Flagged card activity is rising, concentrated in Ahmedabad and newly registered devices.",
    },
    {
      id: "RSK-002",
      title: "Loan default acceleration",
      category: "loans" as const,
      severity: "medium" as const,
      summary: "Defaults are growing faster in Ahmedabad. Unsecured products need a closer look.",
    },
    {
      id: "RSK-003",
      title: "Suspicious device cluster",
      category: "fraud" as const,
      severity: "high" as const,
      summary: "Repeated device identifiers connect flagged online transactions in Ahmedabad.",
    },
  ].map((r, i) => {
    const ctx: QueryContext = {
      domain: r.category,
      region: i === 2 ? "Ahmedabad" : undefined,
      newDeviceOnly: i === 2,
    };
    const current = analyze(ctx),
      previous = analyze(ctx, baselineMonth);
    const delta = change(current.affected, previous.affected);
    return {
      ...r,
      status: "Open",
      metric:
        i === 2
          ? `${current.flagged.filter((t) => t.newDevice).length} linked transactions`
          : `+${delta.toFixed(0)}%`,
      changePercentage: delta,
      affectedRecords: current.affected,
      estimatedExposure: current.exposure,
      detectedAt: "2026-09-30T18:30:00+05:30",
      confidence: i === 1 ? 84 : 96,
      evidence: evidence(ctx),
    };
  });
}
function contextForRisk(id: string): QueryContext {
  if (!buildRisks().some((r) => r.id === id))
    throw new Error("Risk event not found. Select an event from Risk Radar.");
  return {
    domain: id === "RSK-002" ? "loans" : "fraud",
    region: id === "RSK-003" ? "Ahmedabad" : undefined,
    newDeviceOnly: id === "RSK-003",
    riskId: id,
  };
}
export function buildInvestigation(id: string, scope?: QueryContext): Investigation {
  const defaults = contextForRisk(id);
  const ctx = { ...defaults, ...scope, domain: defaults.domain, riskId: id };
  const sourceRisk = buildRisks().find((r) => r.id === id)!;
  const population = analyze(ctx);
  const risk = {
    ...sourceRisk,
    affectedRecords: population.affected,
    estimatedExposure: population.exposure,
    evidence: evidence(ctx),
  };
  return {
    id: `INV-${id.slice(-3)}`,
    title: risk.title,
    risk,
    scope: ctx,
    createdAt: "2026-09-30T18:35:00+05:30",
    status: "In review",
    metrics: metrics(ctx),
    trend: trend(ctx),
    segments: segmentTable(ctx),
    evidence: evidence(ctx),
    findings: [finding(ctx), contributionFinding(ctx)],
    actions:
      ctx.domain === "fraud"
        ? [
            "Review the linked device cluster with the fraud operations team.",
            "Validate customer activity and merchant context before escalation.",
            "Model stronger authentication before proposing a control change.",
          ]
        : [
            "Review repayment histories for newly defaulted loans.",
            "Compare secured and unsecured products within the affected branch.",
            "Escalate findings to a human credit risk reviewer.",
          ],
    timeline: [
      {
        time: "18:30",
        title: "Risk signal detected",
        detail: "September snapshot compared with August baseline.",
      },
      {
        time: "18:31",
        title: "Source records reconciled",
        detail: "Transaction, customer, and branch relationships validated.",
      },
      {
        time: "18:33",
        title: "Concentration identified",
        detail: "Regional and product segments compared.",
      },
      {
        time: "18:35",
        title: "Ready for human review",
        detail: "Findings and source references assembled. No bank action taken.",
      },
    ],
  };
}
export function calculateScenario(input: ScenarioInput): ScenarioResult {
  const defaults = contextForRisk(input.riskId);
  const riskContext = {
    ...defaults,
    ...input.scope,
    domain: defaults.domain,
    riskId: input.riskId,
  };
  if (riskContext.domain !== "fraud")
    throw new Error(
      "The authentication scenario is available for transaction risks. Select a card or device risk."
    );
  if (
    ![input.coverage, input.effectiveness, input.friction].every(Number.isFinite) ||
    input.coverage < 0 ||
    input.coverage > 100 ||
    input.effectiveness < 0 ||
    input.effectiveness > 100 ||
    input.friction < 0 ||
    input.friction > 30
  )
    throw new Error("Scenario values are outside their supported ranges.");
  const a = analyze(riskContext);
  const reduction =
    Math.round(((((a.exposure * input.coverage) / 100) * input.effectiveness) / 100) * 100) / 100;
  const challenged = Math.round((a.affected * input.coverage) / 100);
  return {
    input: { ...input, scope: riskContext },
    baseline: a.exposure,
    projected: Math.round((a.exposure - reduction) * 100) / 100,
    reduction,
    affected: a.affected,
    challenged,
    abandoned: Math.round((challenged * input.friction) / 100),
    assumptions: [
      "Illustrative linear model, not a trained forecast or validated intervention effect.",
      `Scope: ${riskContext.region ?? "All regions"}${riskContext.comparison ? ` and ${riskContext.comparison}` : ""}${riskContext.newDeviceOnly ? "; newly registered devices only" : ""}.`,
      `${input.coverage}% of flagged transactions receive additional authentication; assumed prevention effectiveness is ${input.effectiveness}%.`,
      `Assumed challenge abandonment: ${input.friction}%. Each challenged transaction is treated as an independent event.`,
      "Exposure reduction = flagged value × coverage × assumed effectiveness. No controls are applied.",
    ],
  };
}
export function resolveContext(query: string, previous?: QueryContext): QueryContext {
  const q = query.toLowerCase();
  const domain = /loan|default|credit risk|secured/.test(q)
    ? "loans"
    : /fraud|transaction|device|card/.test(q)
      ? "fraud"
      : (previous?.domain ?? "fraud");
  const ctx: QueryContext = previous?.domain === domain ? { ...previous } : { domain };
  ctx.domain = domain;
  if (/all regions|reset|portfolio|overall/.test(q)) {
    delete ctx.region;
    delete ctx.comparison;
    delete ctx.minAmount;
    delete ctx.newDeviceOnly;
    ctx.riskId = domain === "loans" ? "RSK-002" : "RSK-001";
  }
  const mentioned = branches.filter((b) => q.includes(b.region.toLowerCase())).map((b) => b.region);
  if (/compare/.test(q) && mentioned.length) {
    ctx.region = mentioned.length > 1 ? mentioned[0] : ctx.region;
    ctx.comparison = mentioned.length > 1 ? mentioned[1] : mentioned[0];
    if (!ctx.region) {
      ctx.region = ctx.comparison;
      delete ctx.comparison;
    }
  } else if (mentioned.length) {
    ctx.region = mentioned[0];
    delete ctx.comparison;
  }
  const threshold = q.match(/above\s*₹?\s*([\d,.]+)\s*(lakh|lac|l|crore|cr|k)?/);
  if (threshold)
    ctx.minAmount =
      Number(threshold[1].replaceAll(",", "")) *
      ({ lakh: 100000, lac: 100000, l: 100000, crore: 10000000, cr: 10000000, k: 1000 }[
        threshold[2] ?? ""
      ] ?? 1);
  ctx.riskId =
    domain === "loans"
      ? "RSK-002"
      : /cluster|segment/.test(q) && /investigate|largest/.test(q)
        ? "RSK-003"
        : ctx.riskId === "RSK-002"
          ? "RSK-001"
          : (ctx.riskId ?? "RSK-001");
  if (/new.*device|newly registered/.test(q)) ctx.newDeviceOnly = true;
  if (
    /largest cluster|investigate.*cluster|investigate that segment/.test(q) &&
    domain === "fraud"
  ) {
    ctx.region = "Ahmedabad";
    delete ctx.comparison;
    ctx.newDeviceOnly = true;
    ctx.riskId = "RSK-003";
  }
  return ctx;
}
export const mockService: Pick<MockAnalysisService, "generateReport" | "sendAnalystQuery"> = {
  async generateReport(investigation, scenario) {
    await delay(600);
    return {
      id: uid("RPT"),
      title: `${investigation.title} — investigation report`,
      createdAt: new Date().toISOString(),
      investigation,
      scenario,
    };
  },
  async sendAnalystQuery(query, previous, scenario): Promise<AnalystResponse> {
    if (!query.trim()) throw new Error("Enter a banking question to start an analysis.");
    await delay(1200);
    const ctx = resolveContext(query, previous),
      q = query.toLowerCase();
    const current = analyze(ctx),
      prior = analyze(ctx, baselineMonth);
    const delta = change(current.affected, prior.affected);
    const scope = ctx.region
      ? `${ctx.region}${ctx.comparison ? ` vs ${ctx.comparison}` : ""}`
      : "All regions";
    const base = {
      id: uid("MSG"),
      question: query,
      context: ctx,
      timestamp: new Date().toISOString(),
    };
    if (/policy|kyc|procedure|documentation/.test(q)) {
      const policy = policies.find((p) =>
        q.includes("kyc")
          ? p.id.includes("KYC")
          : q.includes("credit")
            ? p.id.includes("CR")
            : p.id.includes("FR")
      )!;
      return {
        ...base,
        title: policy.title,
        blocks: [
          { type: "TEXT", text: policy.summary },
          {
            type: "EVIDENCE",
            evidence: [
              {
                id: policy.id,
                title: `${policy.title} · ${policy.version}`,
                source: "Synthetic demonstration policy",
                detail: policy.sections.join(" "),
                records: [
                  policy.id,
                  "Demo guidance only; not an actual bank policy or legal advice.",
                ],
              },
            ],
          },
        ],
        suggestions: ["Show suspicious transactions", "What is the KYC escalation procedure?"],
      };
    }
    if (/report/.test(q)) {
      const inv = buildInvestigation(ctx.riskId!, ctx);
      const report = await this.generateReport(
        inv,
        scenario &&
          scenario.input.riskId === ctx.riskId &&
          scenario.baseline === analyze(ctx).exposure
          ? scenario
          : undefined
      );
      return {
        ...base,
        title: "Investigation report prepared",
        blocks: [
          {
            type: "TEXT",
            text: "This report covers the selected risk event. The report scope and source references are shown below.",
          },
          { type: "REPORT", report },
        ],
        suggestions: ["Show all regions", "What are the main risk factors?"],
      };
    }
    if (/what if|what-if|scenario|stronger authentication/.test(q)) {
      if (ctx.domain === "loans")
        return {
          ...base,
          title: "Choose a supported scenario",
          blocks: [
            {
              type: "TEXT",
              text: "This prototype models stronger transaction authentication. Credit-limit and loan scenarios are not implemented yet. Ask about card fraud to explore the authentication scenario.",
            },
          ],
          suggestions: ["Show card fraud", "Compare default rates by branch"],
        };
      const result = calculateScenario({
        riskId: ctx.riskId!,
        coverage: 80,
        effectiveness: 65,
        friction: 5,
        scope: ctx,
      });
      return {
        ...base,
        title: "Stronger authentication · illustrative scenario",
        blocks: [
          { type: "COMPARISON", result },
          {
            type: "ACTION",
            label: "Adjust scenario assumptions",
            action: "simulate",
            riskId: ctx.riskId!,
          },
        ],
        suggestions: ["Generate a report for the risk team", "Show affected transactions"],
      };
    }
    if (
      !/fraud|transaction|card|device|loan|default|risk|region|branch|why|compare|investigat|segment|factor|ahmedabad|surat|mumbai|bengaluru|show|only|increase|affected|all|portfolio/.test(
        q
      )
    )
      return {
        ...base,
        title: "Explore the available demo data",
        blocks: [
          {
            type: "TEXT",
            text: "I can analyze synthetic card alerts and loan defaults, compare branches, investigate device clusters, and model stronger authentication. This is a deterministic demo analyst; general-purpose AI is not connected yet.",
          },
        ],
        suggestions: ["Why did fraud increase this month?", "Compare default rates by branch"],
      };
    const blocks: ResponseBlock[] = [
      {
        type: "TEXT",
        text: `${ctx.domain === "fraud" ? "Flagged transactions" : "Loan defaults"} ${delta >= 0 ? "increased" : "decreased"} ${Math.abs(delta).toFixed(1)}% compared with August. ${scope} · September 2026${ctx.minAmount ? ` · transactions above ${money(ctx.minAmount)}` : ""}.`,
      },
      { type: "KPI", metrics: metrics(ctx) },
      {
        type: "CHART",
        title: ctx.domain === "fraud" ? "Flagged transaction trend" : "Loan default trend",
        subtitle: "Monthly count · April–September 2026",
        kind: "area",
        points: trend(ctx),
      },
      {
        type: "CHART",
        title: "Regional risk distribution",
        subtitle: "September 2026 · affected records in the selected scope",
        kind: "bar",
        points: regions(ctx),
      },
      { type: "TABLE", title: "Where the risk is concentrated", data: segmentTable(ctx) },
      { type: "INSIGHT", title: "Patterns worth investigating", text: finding(ctx) },
      { type: "INSIGHT", title: "Contribution to the change", text: contributionFinding(ctx) },
      { type: "EVIDENCE", evidence: evidence(ctx) },
      {
        type: "ACTION",
        label: "Open investigation workspace",
        action: "investigate",
        riskId: ctx.riskId!,
      },
    ];
    if (/secured|product/.test(q) && ctx.domain === "loans")
      blocks.splice(3, 0, {
        type: "TABLE",
        title: "Loan product comparison",
        data: {
          columns: ["Product", "Loans", "Defaults", "Default rate"],
          rows: ["Secured", "Unsecured"].map((type) => {
            const total = current.loanSet.filter((l) => l.type === type).length;
            const defaults = current.defaults.filter((l) => l.type === type).length;
            return [type, total, defaults, `${((defaults / total) * 100).toFixed(1)}%`];
          }),
        },
      });
    if (/transaction|affected/.test(q) && ctx.domain === "fraud")
      blocks.splice(4, 0, {
        type: "TABLE",
        title: "Sample flagged transactions · first 8",
        data: {
          columns: ["Transaction", "Amount", "Channel", "Device", "Risk score"],
          rows: current.flagged
            .slice(0, 8)
            .map((t) => [
              t.id,
              money(t.amount),
              t.channel,
              t.newDevice ? "New" : "Known",
              t.riskScore,
            ]),
        },
      });
    return {
      ...base,
      title: /why|factor|investigat/.test(q)
        ? "The signal behind the increase"
        : ctx.domain === "fraud"
          ? "Your transaction risk, in focus"
          : "A closer look at loan performance",
      blocks,
      suggestions:
        ctx.domain === "fraud"
          ? [
              "Only Ahmedabad",
              "Compare it to Surat",
              "What if we apply stronger authentication?",
              "Generate a report for the risk team",
            ]
          : [
              "Only Ahmedabad",
              "Compare it to Surat",
              "Compare secured and unsecured loans",
              "Generate a report for the risk team",
            ],
    };
  },
};
