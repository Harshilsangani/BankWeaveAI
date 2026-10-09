// Server-only gateway; browser callers cannot choose the upstream or supply SQL.
import { headers } from "next/headers";
export async function workspaceHeaders() {
  const incoming = await headers();
  const result: Record<string, string> = {};
  for (const key of [
    "x-risklens-session",
    "x-risklens-role",
    "x-risklens-request-id",
    "x-risklens-conversation",
  ]) {
    const value = incoming.get(key);
    if (value) result[key] = value;
  }
  return result;
}
export class BackendError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}
const base = process.env.RISKLENS_BACKEND_URL ?? "http://127.0.0.1:8000";
export async function fraudBackend<T>(
  path: string,
  body?: unknown,
  method?: "GET" | "POST" | "PATCH" | "DELETE"
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}/${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", ...(await workspaceHeaders()) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new BackendError(
      "The local banking database service is unavailable. Start the app with npm run dev.",
      502
    );
  }
  const payload = await response.json();
  if (!response.ok)
    throw new BackendError(
      payload.error ??
        (Array.isArray(payload.detail)
          ? `Check the supplied values: ${payload.detail
              .map((item: { msg?: string }) => item.msg ?? "Invalid field")
              .slice(0, 3)
              .join("; ")}`
          : payload.detail) ??
        "Banking analysis failed.",
      response.status
    );
  return payload as T;
}
