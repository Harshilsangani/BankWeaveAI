import type { Investigation } from "@/features/investigations/types";
import type { QueryContext } from "@/shared/types/scope";
import { request, post } from "@/shared/api/client";

export const getInvestigationCase = (id: string) =>
  request<import("@/features/investigations/types/cases").InvestigationCase>(
    `cases?id=${encodeURIComponent(id)}`
  );

export const getInvestigationCases = (
  filters: { q?: string; status?: string; datasetId?: string; offset?: number } = {}
) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== "") query.set(key, String(value));
  return request<import("@/features/investigations/types/cases").CaseLibrary>(`cases?${query}`);
};

export const getInvestigationSource = (id: string) =>
  request<import("@/features/investigations/types/cases").CaseSourceStatus>(
    `cases?id=${encodeURIComponent(id)}&resource=source`
  );

export const updateInvestigationCase = (
  id: string,
  body: {
    revision: number;
    status?: string;
    owner?: string;
    kind?: "note" | "action";
    note?: string;
  }
) =>
  request<import("@/features/investigations/types/cases").InvestigationCase>("cases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...body }),
  });

export const getSavedInvestigation = (id: string) =>
  request<Investigation>(`investigations?id=${encodeURIComponent(id)}`);
export const startInvestigation = (riskId: string, scope?: QueryContext) =>
  post<Investigation>("investigations", { riskId, scope });

export const getEvidencePage = (scope: QueryContext, offset = 0) =>
  post<{
    columns: string[];
    rows: (string | number)[][];
    total: number;
    offset: number;
    nextOffset: number | null;
  }>("evidence", { scope, offset, limit: 10 });
