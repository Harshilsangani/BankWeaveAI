import type { DatasetId, DatasetInfo } from "@/shared/types/scope";
import type { RiskEvent } from "@/features/risk/types";

export interface DetectionRule {
  id: string;
  name: string;
  minCount: number;
  minIncreasePct: number | null;
  minBaselineCount?: number;
  minRateIncreasePp?: number;
}
export interface DetectionCheck {
  id: string;
  name: string;
  status: "matched" | "clear" | "insufficient";
  reason: string;
  currentCount: number;
  baselineCount: number | null;
  currentTotal: number;
  baselineTotal: number | null;
  currentRate: number;
  baselineRate: number | null;
  increasePct: number | null;
  rateIncreasePp: number | null;
  threshold: DetectionRule;
}
export interface DetectionRun {
  id: string;
  datasetId: DatasetId;
  period: string;
  method: "rules";
  modelCalls: number;
  rulesVersion: string;
  inputHash: string;
  sourceVersion: string;
  sourceCounts: Record<string, number>;
  thresholds: Record<string, DetectionRule>;
  checks: DetectionCheck[];
  events: RiskEvent[];
  createdAt: string;
  replayed: boolean;
}
export interface DetectionView {
  datasetId: DatasetId;
  period: string;
  baselinePeriod: string;
  baselineAvailable: boolean;
  method: "rules";
  modelCalls: number;
  rulesVersion: string;
  snapshot: DetectionRun | null;
  stale: boolean;
  rules: DetectionRule[];
  coverage: DatasetInfo["coverage"];
  limitations: string[];
}
