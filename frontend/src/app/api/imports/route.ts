import { backendRequest, bankingBackend, readBackendJson } from "@/shared/api/server";
import { badRequest, isRecord, readJson, run } from "@/shared/api/route-helpers";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const resource = params.get("resource") === "history" ? "history" : "schema";
  const dataset = params.get("dataset") ?? "meridian";
  return run(() =>
    bankingBackend(`data/imports/${resource}?datasetId=${encodeURIComponent(dataset)}`)
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
      const response = await backendRequest(
        "data/imports/file",
        {
          method: "POST",
          body: form,
          signal: request.signal,
        },
        30000
      );
      return readBackendJson(response);
    });
  }
  const body = await readJson(request);
  if (!isRecord(body) || !["review", "apply"].includes(String(body.action)))
    return badRequest("Select a valid import action.");
  const { action, ...payload } = body;
  return run(() => bankingBackend(`data/imports/${action}`, payload));
}
