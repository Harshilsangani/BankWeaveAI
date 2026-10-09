/** Shared helpers for the service-boundary routes under `app/api/`.
 *
 * These routes are the seam described in `services/index.ts`: they proxy the
 * local FastAPI backend over HTTP so the browser never touches database
 * credentials or raw SQL. Response schemas must not change. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

export async function run(work: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await work());
  } catch (e) {
    const status = e instanceof Error && 'status' in e && typeof e.status === 'number' && [400,403,404,409,422,502,504].includes(e.status) ? e.status : 400;
    return Response.json({error: e instanceof Error ? e.message : 'The request could not be completed.'},{status});
  }
}
