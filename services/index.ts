import type {
  AnalystResponse,
  Dashboard,
  DatasetInfo,
  Investigation,
  Policy,
  QueryContext,
  Report,
  RiskEvent,
  ScenarioInput,
  ScenarioResult,
} from "@/types";
import type { BankWeaveService } from "./contracts";
import type { ConversationSummary } from "@/types/conversations";

let activeConversationId: string | undefined;
let conversationWorkspaceId: string | undefined;
export function workspaceConversationId() {
  if (typeof window === "undefined") return undefined;
  const sid = workspaceSessionId();
  if (conversationWorkspaceId === sid && activeConversationId) return activeConversationId;
  try {
    const saved = sessionStorage.getItem(`risklens-chat-v1-${sid}`);
    if (saved && /^[a-zA-Z0-9-]{16,80}$/.test(saved)) {
      conversationWorkspaceId = sid;
      activeConversationId = saved;
      return saved;
    }
  } catch {
    // Backend recovery still works when tab storage is unavailable.
  }
  return undefined;
}
export function setWorkspaceConversationId(id: string) {
  activeConversationId = id;
  conversationWorkspaceId = workspaceSessionId();
  try {
    sessionStorage.setItem(`risklens-chat-v1-${conversationWorkspaceId}`, id);
  } catch {
    // The in-memory selection remains usable without browser storage.
  }
}

// HTTP composition root. Next routes proxy validated FastAPI tools; the
// browser cannot choose an upstream, database credentials or raw SQL.
const API_BASE = "/api";
import { developmentRoleHeader, selectDevelopmentRole, type StaffRole } from "@/lib/staff-role";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    const sid = workspaceSessionId();
    if (sid) headers.set("x-risklens-session", sid);
    const cid = workspaceConversationId();
    if (cid) headers.set("x-risklens-conversation", cid);
    if (typeof window !== "undefined") headers.set("x-risklens-role", developmentRoleHeader());
    response = await fetch(`${API_BASE}/${path}`, { ...init, headers });
  } catch {
    throw new Error("The BankWeave service is unreachable. Start the local server and retry.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Request failed with status ${response.status}.`
    );
  }
  return (await response.json()) as T;
}

export function workspaceSessionId() {
  if (typeof window === "undefined") return "";
  const role = developmentRoleHeader();
  const storageKey =
    role === "customer_operator" ? "risklens-session-v1" : `risklens-session-v1-${role}`;
  let sid = localStorage.getItem(storageKey);
  if (!sid || !/^[a-zA-Z0-9-]{16,80}$/.test(sid)) {
    sid = crypto.randomUUID();
    localStorage.setItem(storageKey, sid);
  }
  return sid;
}

export interface StaffIdentity {
  actorId: string;
  role: StaffRole;
  permissions: string[];
  environment: string;
  adapter: string;
}
export const getStaffIdentity = () => request<StaffIdentity>("identity");
export function setDevelopmentRole(role: StaffIdentity["role"]) {
  selectDevelopmentRole(role);
  window.location.reload();
}

export interface WorkspaceSession {
  activeConversationId: string;
  conversations: ConversationSummary[];
  datasetId: import("@/types").DatasetId;
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
export const createConversation = (datasetId: import("@/types").DatasetId, period?: string) =>
  request<WorkspaceSession>("conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ datasetId, period }),
  });
export const getRiskDispositions = () => request<{ dismissed: string[] }>("risk-state");
export const updateRiskDisposition = (action: "dismiss" | "restore", riskId?: string) =>
  request<{ dismissed: string[] }>("risk-state", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, riskId }),
  });
export const getInvestigationCase = (id: string) =>
  request<import("@/types/cases").InvestigationCase>(`cases?id=${encodeURIComponent(id)}`);
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
  request<import("@/types/cases").InvestigationCase>("cases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...body }),
  });
export const getSavedInvestigation = (id: string) =>
  request<Investigation>(`investigations?id=${encodeURIComponent(id)}`);
export const resetWorkspaceSession = (datasetId: import("@/types").DatasetId, period?: string) =>
  request<WorkspaceSession>("session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ datasetId, period }),
  });
export const saveFormCorrection = (id: string, fields: import("@/types").CustomerFields) =>
  request<Pick<import("@/types").FormDraft, "revision" | "provenance" | "possibleDuplicates">>(
    "forms",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, fields }),
    }
  );

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const service: BankWeaveService = {
  getDashboard: () => request<Dashboard>("dashboard"),
  getPolicies: () => request<Policy[]>("policies"),
  getRiskRadar: () => request<RiskEvent[]>("risk-radar"),
  startInvestigation: (riskId: string, scope?: QueryContext) =>
    post<Investigation>("investigations", { riskId, scope }),
  runScenario: (input: ScenarioInput) => post<ScenarioResult>("scenarios", input),
  sendAnalystQuery: (query: string, context?: QueryContext, scenario?: ScenarioResult) =>
    post<AnalystResponse>("analyst", { query, context, scenario }),
  generateReport: (investigation: Investigation, scenario?: ScenarioResult) =>
    post<Report>("reports", { investigation, scenario }),
};

export const getDashboard = service.getDashboard.bind(service);
export const sendAnalystQuery = service.sendAnalystQuery.bind(service);
export const getRiskRadar = service.getRiskRadar.bind(service);
export const startInvestigation = service.startInvestigation.bind(service);
export const runScenario = service.runScenario.bind(service);
export const generateReport = service.generateReport.bind(service);
export const getPolicies = service.getPolicies.bind(service);
export const getDataQuality = (dataset: string) =>
  request<import("@/types/data-quality").DataQuality>(
    `data-quality?dataset=${encodeURIComponent(dataset)}`
  );
export const getCustomerRepayments = (id: string) =>
  request<import("@/types/repayments").RepaymentLedger>(`repayments?id=${encodeURIComponent(id)}`);
export const getCustomerInsurance = (id: string) =>
  request<import("@/types/insurance").InsuranceOverview>(`insurance?id=${encodeURIComponent(id)}`);
export const getCustomerRecommendations = (id: string) =>
  request<import("@/types/recommendations").Recommendations>(
    `recommendations?id=${encodeURIComponent(id)}`
  );
export const getCustomerFinancialHealth = (id: string) =>
  request<import("@/types/financial-health").FinancialHealth>(
    `financial-health?id=${encodeURIComponent(id)}`
  );
export const getCustomerKyc = (id: string) =>
  request<import("@/types/kyc").KycCase[]>(`kyc?id=${encodeURIComponent(id)}`);
export const getRecordMaintenance = (id: string) =>
  request<import("@/types/maintenance").Maintenance>(`maintenance?id=${encodeURIComponent(id)}`);
export const maintainRecord = (id: string, action: string, body: Record<string, unknown>) =>
  post<{ operationId: string; entityId?: string; status: string; replayed: boolean }>(
    "maintenance",
    { id, action, ...body }
  );
export const openCustomerKyc = (id: string, reason: string) =>
  post<import("@/types/kyc").KycCase>("kyc", { id, reason });
export const reviewKyc = (
  id: string,
  body: { revision: number; status: string; kind: string; reference: string; note: string }
) =>
  request<import("@/types/kyc").KycCase>("kyc", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...body }),
  });
export const updateCustomerNeeds = (
  id: string,
  body: {
    revision: number;
    consent: boolean;
    needs: import("@/types/recommendations").CustomerNeed[];
    minimumCover: number;
    reason: string;
  }
) =>
  request<import("@/types/recommendations").Recommendations>("recommendations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action: "preferences", ...body }),
  });
export const reviewCustomerRecommendation = (
  id: string,
  recommendationId: string,
  body: { revision: number; status: string; note: string }
) =>
  request<import("@/types/recommendations").Recommendations>("recommendations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action: "review", recommendationId, ...body }),
  });
export const previewTransactionImport = (datasetId: string, csv: string) =>
  post<import("@/types/data-quality").ImportPreview>("data-quality", {
    action: "preview",
    datasetId,
    csv,
  });
export const getImportSchema = (dataset: string) =>
  request<import("@/types/imports").ImportSchema>(
    `imports?resource=schema&dataset=${encodeURIComponent(dataset)}`
  );
export const getImportHistory = (dataset: string) =>
  request<import("@/types/imports").ImportHistory[]>(
    `imports?resource=history&dataset=${encodeURIComponent(dataset)}`
  );
export const uploadBankingFile = (datasetId: string, file: File) => {
  const form = new FormData();
  form.set("datasetId", datasetId);
  form.set("file", file);
  return request<import("@/types/imports").ImportUpload>("imports", { method: "POST", body: form });
};
export const reviewBankingImport = (body: {
  uploadId: string;
  entity: import("@/types/imports").ImportEntity;
  sheet: string;
  mapping: Record<string, string>;
  timezone: "+05:30" | "+00:00";
}) => post<import("@/types/imports").FileImportPreview>("imports", { action: "review", ...body });
export const applyBankingImport = (preview: import("@/types/imports").FileImportPreview) =>
  post<{
    previewId: string;
    entity: import("@/types/imports").ImportEntity;
    importedRows: number;
    replayed: boolean;
  }>("imports", {
    action: "apply",
    previewId: preview.id,
    sourceHash: preview.sourceHash,
    confirmed: true,
  });
export const confirmTransactionImport = (preview: import("@/types/data-quality").ImportPreview) =>
  post<{ importedRows: number; replayed: boolean }>("data-quality", {
    action: "confirm",
    previewId: preview.id,
    sourceHash: preview.sourceHash,
    confirmed: true,
  });
export const runDetection = () =>
  post<{ id: string; replayed: boolean; events: RiskEvent[] }>("detectors", {
    datasetId: "meridian",
  });
export const ingestPolicy = (document: {
  id: string;
  version: string;
  title: string;
  category: string;
  markdown: string;
}) => post<{ id: string; version: string; sha256: string }>("policies", document);
export const getDatasets = () => request<DatasetInfo[]>("datasets");
export const getCustomerDetails = (id: string) =>
  request<import("@/types/data-workspace").CustomerDetails>(
    `data?${new URLSearchParams({ resource: "customer", id })}`
  );
export const getCustomerDirectory = (
  q = "",
  offset = 0,
  filters: { branch?: string; source?: string; status?: string; product?: string } = {}
) =>
  request<import("@/types/data-workspace").DirectoryPage>(
    `data?${new URLSearchParams({ resource: "customers", q, offset: String(offset), ...filters })}`
  );
export const getSourceRecords = (dataset: string, table: string, q = "", offset = 0) =>
  request<import("@/types/data-workspace").SourcePage>(
    `data?${new URLSearchParams({ resource: "records", dataset, table, q, offset: String(offset) })}`
  );
export const saveCustomerProfile = (
  fields: import("@/types").CustomerFields,
  profile?: import("@/types/data-workspace").CustomerProfile
) =>
  request<import("@/types/data-workspace").CustomerProfile>("data", {
    method: profile ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields,
      ...(profile ? { id: profile.id, revision: profile.revision } : {}),
    }),
  });
export const deleteCustomerProfile = (profile: import("@/types/data-workspace").CustomerProfile) =>
  request<{ deleted: boolean }>("data", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: profile.id, revision: profile.revision }),
  });
export const getEvidencePage = (scope: QueryContext, offset = 0) =>
  post<{
    columns: string[];
    rows: (string | number)[][];
    total: number;
    offset: number;
    nextOffset: number | null;
  }>("evidence", { scope, offset, limit: 10 });
export const uploadForm = (file: File) => {
  const body = new FormData();
  body.set("file", file);
  return request<import("@/types").FormDraft>("forms", { method: "POST", body });
};
export const submitCustomerApproval = (
  draft: import("@/types").FormDraft,
  fields: import("@/types").CustomerFields,
  review?: {
    reviewRevision?: number;
    duplicateDecision?: "reuse" | "create_separate";
    duplicateReason?: string;
  }
) =>
  post<import("@/types/approvals").ApprovalRequest>("customers", {
    threadId: draft.threadId,
    draftId: draft.id,
    confirmed: true,
    fields,
    ...review,
  });

export const getApprovalRequests = (status = "pending", offset = 0) =>
  request<import("@/types/approvals").ApprovalPage>(
    `approvals?status=${encodeURIComponent(status)}&offset=${offset}`
  );
export const getApprovalRequest = (id: string) =>
  request<import("@/types/approvals").ApprovalDetail>(`approvals?id=${encodeURIComponent(id)}`);
export const decideApprovalRequest = (
  id: string,
  body: {
    decision: "approve" | "reject";
    revision: number;
    confirmed: boolean;
    note: string;
    duplicateDecision?: "reuse" | "create_separate";
    duplicateReason?: string;
  }
) => post<import("@/types/approvals").ApprovalDetail>("approvals", { id, ...body });
