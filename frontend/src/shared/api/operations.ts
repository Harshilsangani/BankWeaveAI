import { getStaffIdentity, workspaceSessionId, workspaceConversationId } from "@/shared/api/client";
import { developmentRoleHeader } from "@/shared/lib/staff-role";
import { readBackendJson } from "@/shared/api/errors";
export interface ProgressEvent {
  type: "progress";
  stage: string;
  status: "running" | "complete";
}
export interface OperationOptions {
  requestId: string;
  signal: AbortSignal;
  onProgress: (event: ProgressEvent) => void;
}
export class OperationError extends Error {
  constructor(
    message: string,
    public terminal = false
  ) {
    super(message);
  }
}
export async function streamOperation<T>(
  kind: "query" | "investigation" | "form",
  payload: unknown,
  options: OperationOptions
): Promise<T> {
  await getStaffIdentity();
  options.signal.throwIfAborted();
  const headers = new Headers({
    "x-risklens-session": workspaceSessionId(),
    "x-risklens-role": developmentRoleHeader(),
    "x-risklens-request-id": options.requestId,
  });
  const conversationId = workspaceConversationId();
  if (conversationId) headers.set("x-risklens-conversation", conversationId);
  let body: BodyInit;
  if (kind === "form") {
    const form = new FormData();
    form.set("file", payload as File);
    body = form;
  } else {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify({ kind, payload });
  }
  const response = await fetch("/api/operations", {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(120000)]),
  });
  if (!response.ok) {
    try {
      await readBackendJson(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The operation failed.";
      // A transient HTTP failure cannot establish whether the backend saved
      // the result. Retry the same ID so a completed operation is replayed.
      const uncertain = response.status >= 500 || [408, 429].includes(response.status);
      throw new OperationError(message, !uncertain && !message.includes("already running"));
    }
  }
  if (!response.body)
    throw new Error("The operation returned no stream. Retry to recover its saved result.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const event = JSON.parse(data);
        if (event.type === "progress") options.onProgress(event);
        if (event.type === "result") return event.data as T;
        if (event.type === "error")
          throw new OperationError(event.message ?? "The operation failed.", true);
      }
      if (chunk.done) break;
    }
    throw new Error(
      "Connection ended before the result arrived. Retry to recover a completed result."
    );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function cancelOperation(requestId: string) {
  await getStaffIdentity();
  const response = await fetch(`/api/operations?id=${encodeURIComponent(requestId)}`, {
    method: "DELETE",
    headers: {
      "x-risklens-session": workspaceSessionId(),
      "x-risklens-role": developmentRoleHeader(),
    },
  });
  await readBackendJson(response);
}
