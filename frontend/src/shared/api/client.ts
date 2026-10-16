import { randomId } from "@/shared/lib/random-id";
import type { DatasetScope } from "@/shared/types/scope";
import {
  developmentRoleHeader,
  selectDevelopmentRole,
  type StaffRole,
} from "@/shared/lib/staff-role";

let activeConversationId: string | undefined;

let conversationWorkspaceId: string | undefined;

let verifiedIdentity: StaffIdentity | undefined;

let identityRequest: Promise<StaffIdentity> | undefined;

const memorySessions = new Map<string, string>();

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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  if (path !== "identity" && typeof window !== "undefined") await getStaffIdentity();
  try {
    const headers = new Headers(init?.headers);
    const sid = path === "identity" ? "" : workspaceSessionId();
    if (sid) headers.set("x-risklens-session", sid);
    const cid = path === "identity" ? undefined : workspaceConversationId();
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
  const storageKey = verifiedIdentity
    ? `risklens-session-v1-verified-${verifiedIdentity.actorId}`
    : role === "customer_operator"
      ? "risklens-session-v1"
      : `risklens-session-v1-${role}`;
  let sid = memorySessions.get(storageKey);
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored && /^[a-zA-Z0-9-]{16,80}$/.test(stored)) sid = stored;
  } catch {
    // Browser storage can be unavailable; keep this page's owned handle stable.
  }
  if (!sid || !/^[a-zA-Z0-9-]{16,80}$/.test(sid)) {
    sid = randomId();
  }
  memorySessions.set(storageKey, sid);
  try {
    localStorage.setItem(storageKey, sid);
  } catch {
    /* Recovery lasts for this page only. */
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

export function getStaffIdentity() {
  if (!identityRequest)
    identityRequest = request<StaffIdentity>("identity")
      .then((identity) => {
        verifiedIdentity = identity.adapter === "development" ? undefined : identity;
        return identity;
      })
      .catch((error) => {
        identityRequest = undefined;
        throw error;
      });
  return identityRequest;
}

export function setDevelopmentRole(role: StaffIdentity["role"]) {
  selectDevelopmentRole(role);
  window.location.reload();
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function scopedPath(path: string, scope?: DatasetScope): string {
  const query = new URLSearchParams();
  if (scope?.datasetId !== undefined) query.set("datasetId", scope.datasetId);
  if (scope?.period !== undefined) query.set("period", scope.period);
  return query.size ? `${path}?${query}` : path;
}
