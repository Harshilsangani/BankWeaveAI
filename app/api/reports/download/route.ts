import { backendRequest, readBackendJson } from "@/services/fraud-backend";
import { errorResponse } from "../../shared";
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^RPT-[a-zA-Z0-9]+$/.test(id))
    return Response.json({ error: "Select a saved report." }, { status: 400 });
  try {
    const result = await backendRequest(`reports/${id}/download`, { signal: request.signal });
    if (!result.ok) await readBackendJson(result);
    return new Response(result.body, {
      status: result.status,
      headers: Object.fromEntries(
        [
          "Content-Type",
          "Content-Disposition",
          "Cache-Control",
          "ETag",
          "X-Content-Type-Options",
          "Content-Security-Policy",
        ].map((key) => [key, result.headers.get(key) ?? ""])
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
