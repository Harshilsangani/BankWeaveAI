export interface BriefSource {
  id: string;
  label?: string;
  text: string;
  references?: string[];
}

export interface BriefExecution {
  mode: "model" | "local" | "unavailable";
  provider: string | null;
  model: string | null;
  modelCalls: number;
  totalTokens: number;
  durationMs: number;
  validation: string;
  outboundFields: string[];
  calls: { agent: string; status: string; totalTokens: number; durationMs: number }[];
}

export interface CaseReviewBrief {
  id: string;
  caseId: string;
  sourceHash: string;
  artifactHash: string;
  snapshotAt: string;
  promptVersion: string;
  createdAt: string;
  provider: string;
  model: string | null;
  observations: BriefSource[];
  hypotheses: BriefSource[];
  gaps: BriefSource[];
  checks: BriefSource[];
  sources: BriefSource[];
  draftNote: string;
  execution: BriefExecution;
}

export interface CaseBriefState {
  status: "not_prepared" | "running" | "ready" | "unavailable";
  brief: CaseReviewBrief | null;
  message: string;
  execution: BriefExecution | null;
  attempts: number;
  retryAllowed: boolean;
  sourceHash: string;
  artifactHash: string;
  snapshotAt: string;
}
