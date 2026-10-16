import type { QueryContext } from "@/shared/types/scope";
import type { Severity } from "@/shared/types/analysis";
export interface InvestigationCase {
  investigation_id: string;
  owner: string;
  status: "In review" | "Monitoring" | "Resolved";
  revision: number;
  scope: QueryContext;
  events: {
    id: string;
    actor_id: string;
    kind: string;
    note: string;
    source_scope: string;
    created_at: string;
  }[];
}
export interface CaseSummary {
  id: string;
  title: string;
  scope: QueryContext;
  severity: Severity;
  affectedRecords: number;
  owner: string | null;
  status: InvestigationCase["status"];
  revision: number;
  createdAt: string;
  updatedAt: string;
  reportCount: number;
}
export interface CaseLibrary {
  items: CaseSummary[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
}
export interface CaseSourceStatus {
  state: "unavailable" | "unchanged" | "changed";
  checkedAt: string;
  savedAt: string;
  reason: string;
  savedHash?: string;
  currentHash?: string;
  currentCounts?: Record<string, number>;
}
