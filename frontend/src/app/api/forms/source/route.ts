import { backendRequest, readBackendJson } from "@/shared/api/server";
import { errorResponse } from "@/shared/api/route-helpers";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^FORM-[a-zA-Z0-9]+$/.test(id))
    return Response.json({ error: "Select a saved form." }, { status: 400 });
  try {
    const result = await backendRequest(`forms/${id}/source`, { signal: request.signal });
    if (!result.ok) await readBackendJson(result);
    return new Response(result.body, {
      status: result.status,
      headers: Object.fromEntries(
        [
          "Content-Type",
          "Content-Disposition",
          "Cache-Control",
          "X-Content-Type-Options",
          "X-Content-SHA256",
        ].map((key) => [key, result.headers.get(key) ?? ""])
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
