import { BackendError, backendRequest, bankingBackend, readBackendJson } from "@/shared/api/server";
import { badRequest, errorResponse, isRecord, readJson, run } from "@/shared/api/route-helpers";

export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    let path: string, body: BodyInit;
    const headers = new Headers();
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      if (Number(request.headers.get("content-length")) > 9 * 1024 * 1024)
        return badRequest("Upload a form up to 8 MB.");
      const form = await request.formData(),
        file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024)
        return badRequest("Upload a non-empty form up to 8 MB.");
      const upload = new FormData();
      upload.set("file", file);
      body = upload;
      path = "forms/stream";
    } else {
      const input = await readJson(request);
      if (
        !isRecord(input) ||
        !["query", "investigation"].includes(String(input.kind)) ||
        !isRecord(input.payload)
      )
        return badRequest("Select a supported operation and supply its inputs.");
      path = input.kind === "query" ? "analyst/stream" : "investigations/stream";
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(input.payload);
    }
    const upstream = await backendRequest(
      path,
      { method: "POST", headers, body, signal: request.signal },
      115000
    );
    if (!upstream.ok) await readBackendJson(upstream);
    if (!upstream.body || !upstream.headers.get("content-type")?.startsWith("text/event-stream"))
      throw new BackendError(
        "The operation service returned an invalid stream. Retry the request.",
        502
      );
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) return badRequest("Invalid request ID.");
  return run(() => bankingBackend(`operations/${id}`, undefined, "DELETE"));
}
