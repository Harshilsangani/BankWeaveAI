import type { Domain, QueryContext } from "@/shared/types/scope";
import type { Severity, Evidence } from "@/shared/types/analysis";

export interface RiskEvent {
  detection?: {
    stale?: boolean;
    runId: string;
    rulesVersion: string;
    inputHash: string;
    sourceVersion: string;
    sourceCounts: Record<string, number>;
    threshold: { name: string; minCount: number; minIncreasePct: number | null };
    currentCount: number;
    baselineCount: number;
    observedIncreasePct: number | null;
    executedAt: string;
    scope: QueryContext;
  };
  currency?: "INR" | "USD";
  id: string;
  title: string;
  category: Domain;
  severity: Severity;
  status: "Open" | "Investigating" | "Dismissed";
  metric: string;
  changePercentage: number;
  affectedRecords: number;
  estimatedExposure: number;
  detectedAt: string;
  confidence: number;
  summary: string;
  evidence: Evidence[];
}
