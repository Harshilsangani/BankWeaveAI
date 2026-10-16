import type { RiskEvent } from "@/features/risk/types";
import type { DatasetScope } from "@/shared/types/scope";
import { request, post, scopedPath } from "@/shared/api/client";

export const getRiskDispositions = (scope?: DatasetScope) =>
  request<{ dismissed: string[] }>(scopedPath("risk-state", scope));

export const updateRiskDisposition = (
  action: "dismiss" | "restore",
  riskId?: string,
  scope?: DatasetScope
) =>
  request<{ dismissed: string[] }>("risk-state", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, riskId, ...scope }),
  });
export const getRiskRadar = (scope?: DatasetScope) =>
  request<RiskEvent[]>(scopedPath("risk-radar", scope));

export const getDetectionView = (scope: DatasetScope) =>
  request<import("@/features/risk/types/detection").DetectionView>(scopedPath("detectors", scope));

export const runDetection = (scope: DatasetScope = { datasetId: "meridian" }) =>
  post<import("@/features/risk/types/detection").DetectionRun>("detectors", scope);
