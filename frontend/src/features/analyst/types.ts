import type { FormDraft } from "@/features/forms/types";
import type {
  AnalysisMetadata,
  Metric,
  ChartPoint,
  Evidence,
  TableData,
} from "@/shared/types/analysis";
import type { QueryContext } from "@/shared/types/scope";
import type { ScenarioResult } from "@/features/reports/legacy-types";
import type { Report } from "@/features/reports/types";

export type ResponseBlock =
  | {
      type: "CAMPAIGN";
      campaignId: string;
      runId: string;
      title: string;
      status: string;
      reportId?: string;
    }
  | { type: "FORM"; draft: FormDraft }
  | { type: "TEXT"; text: string }
  | { type: "KPI"; metrics: Metric[] }
  | {
      type: "CHART";
      title: string;
      subtitle: string;
      kind: "area" | "bar" | "column" | "donut";
      tone?: "research";
      points: ChartPoint[];
    }
  | { type: "TABLE"; title: string; data: TableData }
  | { type: "INSIGHT"; title: string; text: string }
  | { type: "EVIDENCE"; evidence: Evidence[] }
  | { type: "ACTION"; label: string; action: "investigate" | "simulate" | "report"; riskId: string }
  | { type: "REPORT"; report: Report }
  | { type: "COMPARISON"; result: ScenarioResult };

export interface AnalystResponse {
  analysis?: AnalysisMetadata;
  id: string;
  question: string;
  title: string;
  blocks: ResponseBlock[];
  suggestions: string[];
  research?: boolean;
  context: QueryContext;
  timestamp: string;
}
