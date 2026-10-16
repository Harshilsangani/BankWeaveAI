import { bankingBackend } from "@/shared/api/server";
import { badRequest, isRecord, readJson, run } from "@/shared/api/route-helpers";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  if (search.get("resource") === "customer") {
    const id = search.get("id") ?? "";
    if (!/^CUS-[a-zA-Z0-9-]+$/.test(id)) return badRequest("Select a customer profile.");
    return run(() => bankingBackend(`data/customers/${encodeURIComponent(id)}`));
  }
  const resource = search.get("resource") === "records" ? "records" : "customers";
  const query = new URLSearchParams();
  for (const key of [
    "q",
    "offset",
    ...(resource === "records" ? ["dataset", "table"] : ["branch", "source", "status", "product"]),
  ]) {
    if (search.has(key)) query.set(key, search.get(key)!);
  }
  return run(() => bankingBackend(`data/${resource}?${query}`));
}

async function mutate(request: Request, method: "POST" | "PATCH" | "DELETE") {
  const body = await readJson(request);
  if (!isRecord(body)) return badRequest("Supply valid customer details.");
  const { id, ...payload } = body;
  if (method !== "POST" && (typeof id !== "string" || !/^CUS-[a-zA-Z0-9-]+$/.test(id)))
    return badRequest("Select a local customer profile.");
  return run(() =>
    bankingBackend(
      `data/customers${method === "POST" ? "" : `/${encodeURIComponent(id as string)}`}`,
      payload,
      method
    )
  );
}
export const POST = (request: Request) => mutate(request, "POST");
export const PATCH = (request: Request) => mutate(request, "PATCH");
export const DELETE = (request: Request) => mutate(request, "DELETE");
