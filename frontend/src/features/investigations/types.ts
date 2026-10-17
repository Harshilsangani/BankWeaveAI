import type {
  AnalysisMetadata,
  Metric,
  ChartPoint,
  Evidence,
  TableData,
} from "@/shared/types/analysis";
import type { RiskEvent } from "@/features/risk/types";
import type { QueryContext } from "@/shared/types/scope";

export interface Investigation {
  repaymentEvidence?: {
    asOf: string;
    columns: string[];
    rows: (string | number)[][];
    totalLoans: number;
    truncated: boolean;
    loans: {
      loanId: string;
      installments: {
        id: string;
        dueOn: string;
        dueMinor: number;
        paidMinor: number;
        unpaidMinor: number;
        daysPastDue: number;
        payments: { id: string; paidOn: string; amountMinor: number }[];
      }[];
    }[];
  };
  policyGuidance?: {
    query: string;
    limitation: string;
    sections: {
      reference: string;
      documentId: string;
      title: string;
      section: string;
      version: string;
      text: string;
      sha256: string;
    }[];
  };
  sourceSnapshot?: {
    version?: string;
    inputHash: string;
    sourceCounts: Record<string, number>;
    capturedAt: string;
  };
  execution?: { method: string; modelCalls: number };
  relationshipGraph?: import("@/features/investigations/types/relationships").RelationshipGraph;
  analysis?: AnalysisMetadata;
  id: string;
  risk: RiskEvent;
  scope: QueryContext;
  title: string;
  createdAt: string;
  status: string;
  metrics: Metric[];
  trend: ChartPoint[];
  segments: TableData;
  evidence: Evidence[];
  findings: string[];
  actions: string[];
  timeline: { time: string; title: string; detail: string }[];
}
