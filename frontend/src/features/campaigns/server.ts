import { backendRequest, readBackendJson } from "@/shared/api/server";
import { badRequest, errorResponse } from "@/shared/api/route-helpers";

const routes: Record<string, Record<string, RegExp>> = {
  "card-campaigns": {
    GET: /^(?:|\/(?:readiness|products)|\/[a-zA-Z0-9-]+(?:\/runs\/[a-zA-Z0-9-]+(?:\/candidates)?)?)$/,
    POST: /^(?:|\/(?:products|consent)|\/[a-zA-Z0-9-]+\/(?:runs|schedule)|\/[a-zA-Z0-9-]+\/runs\/[a-zA-Z0-9-]+\/cancel)$/,
  },
  "campaign-reports": {
    GET: /^(?:|\/[a-zA-Z0-9-]+(?:\/download)?)$/,
    POST: /^\/[a-zA-Z0-9-]+\/review$/,
  },
  "staff-notifications": {
    GET: /^$/,
    PATCH: /^\/[a-zA-Z0-9-]+$/,
    DELETE: /^(?:|\/[a-zA-Z0-9-]+)$/,
  },
};
export async function campaignGateway(request: Request, prefix: string) {
  const url = new URL(request.url);
  const suffix = url.pathname.slice(`/api/${prefix}`.length);
  if (!routes[prefix]?.[request.method]?.test(suffix))
    return badRequest("Unsupported campaign operation.");
  const query = new URLSearchParams();
  for (const name of ["datasetId", "period", "status", "offset", "limit"])
    if (url.searchParams.has(name)) query.set(name, url.searchParams.get(name)!);
  try {
    let body: string | undefined;
    if (!["GET", "HEAD"].includes(request.method)) {
      body = await request.text();
      if (body.length > 20000) return badRequest("Keep campaign configuration within 20 KB.");
      if (body && !body.trim().startsWith("{"))
        return badRequest("Supply a campaign configuration object.");
    }
    const response = await backendRequest(`${prefix}${suffix}${query.size ? `?${query}` : ""}`, {
      method: request.method,
      body: body || (request.method === "PATCH" ? "{}" : undefined),
      headers:
        body || request.method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
      signal: request.signal,
    });
    if (!response.ok) await readBackendJson(response);
    if (suffix.endsWith("/download")) {
      const headers = new Headers();
      for (const key of [
        "Content-Type",
        "Content-Disposition",
        "Cache-Control",
        "X-Content-Type-Options",
        "Content-Security-Policy",
        "ETag",
      ]) {
        const value = response.headers.get(key);
        if (value) headers.set(key, value);
      }
      return new Response(response.body, { headers });
    }
    return Response.json(await readBackendJson(response));
  } catch (error) {
    return errorResponse(error);
  }
}
