import { BackendError, fraudBackend, workspaceHeaders } from "@/services/fraud-backend";
import { badRequest, isRecord, readJson, run } from "../shared";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const resource = params.get("resource") === "history" ? "history" : "schema";
  const dataset = params.get("dataset") ?? "meridian";
  return run(() =>
    fraudBackend(`data/imports/${resource}?datasetId=${encodeURIComponent(dataset)}`)
  );
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
      return badRequest("Use a file up to 5 MB.");
    return run(async () => {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
        throw new Error("Use a non-empty CSV or Excel file up to 5 MB.");
      const response = await fetch(
        `${process.env.RISKLENS_BACKEND_URL ?? "http://127.0.0.1:8000"}/data/imports/file`,
        {
          method: "POST",
          headers: await workspaceHeaders(),
          body: form,
          signal: AbortSignal.timeout(30000),
        }
      );
      const payload = await response.json();
      if (!response.ok)
        throw new BackendError(payload.error ?? "The file could not be read.", response.status);
      return payload;
    });
  }
  const body = await readJson(request);
  if (!isRecord(body) || !["review", "apply"].includes(String(body.action)))
    return badRequest("Select a valid import action.");
  const { action, ...payload } = body;
  return run(() => fraudBackend(`data/imports/${action}`, payload));
}
