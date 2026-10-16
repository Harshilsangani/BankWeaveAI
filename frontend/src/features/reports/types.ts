import type { Investigation } from "@/features/investigations/types";
import type { ScenarioResult } from "@/features/reports/legacy-types";

export interface Report {
  caseReview?: import("@/features/investigations/types/cases").InvestigationCase & {
    capturedAt: string;
  };
  id: string;
  title: string;
  createdAt: string;
  investigation: Investigation;
  scenario?: ScenarioResult;
}
