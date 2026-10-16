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
