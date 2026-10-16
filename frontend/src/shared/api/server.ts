// Server-only gateway; browser callers cannot choose the upstream or supply SQL.
import { headers } from "next/headers";
import { BackendError, readBackendJson } from "@/shared/api/errors";
export { BackendError, readBackendJson } from "@/shared/api/errors";
export async function workspaceHeaders() {
  const incoming = await headers();
  const result: Record<string, string> = {};
  for (const key of [
    "x-risklens-session",
    "x-risklens-request-id",
    "x-risklens-conversation",
    ...(process.env.RISKLENS_IDENTITY_ADAPTER === "iap"
      ? ["x-goog-iap-jwt-assertion"]
      : ["x-risklens-role"]),
  ]) {
    const value = incoming.get(key);
    if (value) result[key] = value;
  }
  return result;
}
const base = (process.env.RISKLENS_BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export async function backendRequest(
  path: string,
  init: RequestInit = {},
  timeout = 20000
): Promise<Response> {
  try {
    const forwarded = new Headers(await workspaceHeaders());
    new Headers(init.headers).forEach((value, key) => forwarded.set(key, value));
    return await fetch(`${base}/${path}`, {
      ...init,
      headers: forwarded,
      cache: "no-store",
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
    });
  } catch (error) {
    const timedOut = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    throw new BackendError(
      timedOut
        ? "The banking service request timed out. Retry the request."
        : "The banking service is unavailable. Retry the request.",
      timedOut ? 504 : 502
    );
  }
}
export async function bankingBackend<T>(
  path: string,
  body?: unknown,
  method?: "GET" | "POST" | "PATCH" | "DELETE"
): Promise<T> {
  const response = await backendRequest(
    path,
    {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    path === "analyst" ? 115000 : 20000
  );
  return readBackendJson<T>(response);
}
