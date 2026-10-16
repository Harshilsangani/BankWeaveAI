import { bankingBackend } from "@/shared/api/server";
import { badRequest, isRecord, readJson, run } from "@/shared/api/route-helpers";
export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const id = incoming.get("id");
  if (id)
    return run(() =>
      bankingBackend(
        `cases/${encodeURIComponent(id)}${incoming.get("resource") === "source" ? "/source" : ""}`
      )
    );
  if (incoming.has("resource")) return badRequest("Choose a saved investigation.");
  const query = new URLSearchParams();
  for (const key of ["q", "status", "datasetId", "offset", "limit"])
    if (incoming.has(key)) query.set(key, incoming.get(key)!);
  return run(() => bankingBackend(`cases${query.size ? "?" + query : ""}`));
}
export async function PATCH(request: Request) {
  const payload = await readJson(request);
  if (!isRecord(payload) || typeof payload.id !== "string" || !payload.id)
    return badRequest("Choose a saved investigation to update.");
  const { id, ...body } = payload;
  return run(() => bankingBackend(`cases/${encodeURIComponent(id)}`, body, "PATCH"));
}
