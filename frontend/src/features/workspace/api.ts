import type { AnalystResponse } from "@/features/analyst/types";
import type { Investigation } from "@/features/investigations/types";
import type { QueryContext } from "@/shared/types/scope";
import type { Report } from "@/features/reports/types";
import type { ConversationSummary } from "@/features/workspace/types/conversations";
import { request } from "@/shared/api/client";

export interface WorkspaceSession {
  activeConversationId: string;
  conversations: ConversationSummary[];
  datasetId: import("@/shared/types/scope").DatasetId;
  period?: string;
  context?: QueryContext;
  messages: AnalystResponse[];
  investigation?: Investigation;
  reports: Report[];
}

export const getWorkspaceSession = () => request<WorkspaceSession>("session");

export const getConversationHistory = () => request<ConversationSummary[]>("conversations");

export const openConversation = (id: string) =>
  request<WorkspaceSession>("conversations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });

export const createConversation = (
  datasetId: import("@/shared/types/scope").DatasetId,
  period?: string
) =>
  request<WorkspaceSession>("conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ datasetId, period }),
  });

export const resetWorkspaceSession = (
  datasetId: import("@/shared/types/scope").DatasetId,
  period?: string
) =>
  request<WorkspaceSession>("session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ datasetId, period }),
  });
