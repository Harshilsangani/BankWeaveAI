import type { DatasetId, DatasetInfo } from "@/shared/types/scope";

export interface AnalysisMetadata {
  datasetId: DatasetId;
  datasetName: string;
  period: string;
  baseline: string;
  currency: "INR" | "USD";
  provider: "local" | "vertex";
  model?: string;
  researchExecution?: {
    mode: "model" | "local" | "fallback";
    model?: string | null;
    successfulModelCalls: number;
    totalTokens: number;
    durationMs: number;
    warnings: string[];
    calls: { agent: string; status: string; durationMs: number; totalTokens: number }[];
    tools: { tool: string; status: string; rowCount: number; durationMs: number }[];
  };
  location?: string;
  datasetVersion: string;
  runId: string;
  stages: string[];
  externalTransmission: boolean;
  outboundFields: string[];
  limitations: string[];
  coverage: DatasetInfo["coverage"];
}

export interface AIProviderStatus {
  provider: "local" | "vertex";
  model?: string | null;
  location?: string | null;
}

export type Severity = "high" | "medium" | "low";

export interface Metric {
  label: string;
  value: string;
  change: string;
  direction: "up" | "down" | "neutral";
  detail: string;
  sparkline?: number[];
}

export interface ChartPoint {
  name: string;
  value: number;
  baseline?: number;
}

export interface Evidence {
  id: string;
  title: string;
  source: string;
  detail: string;
  records: string[];
}

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}
