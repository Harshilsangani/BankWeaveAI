/** Shared helpers for the service-boundary routes under `app/api/`.
 *
 * Feature API modules use these same-origin routes, which proxy the
 * FastAPI backend over HTTP so the browser never touches database
 * credentials or raw SQL. Response schemas must not change. */

export { isRecord } from "@/shared/lib/records";

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function datasetQuery(request: Request): string {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["datasetId", "period"])
    if (incoming.has(key)) query.set(key, incoming.get(key)!);
  return query.size ? `?${query}` : "";
}

export async function run(work: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await work());
  } catch (e) {
    return errorResponse(e);
  }
}

export function errorResponse(error: unknown): Response {
  const status =
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : 400;
  return Response.json(
    { error: error instanceof Error ? error.message : "The request could not be completed." },
    { status }
  );
}
