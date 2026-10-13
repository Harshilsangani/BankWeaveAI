import { backendRequest, readBackendJson } from "@/services/fraud-backend";
import { errorResponse } from "../../shared";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^MSG-[a-f0-9]+$/.test(id))
    return Response.json({ error: "Select a saved research answer." }, { status: 400 });
  try {
    const result = await backendRequest(`analyst/${id}/export.pdf`, { signal: request.signal });
    if (!result.ok) await readBackendJson(result);
    return new Response(result.body, {
      status: result.status,
      headers: Object.fromEntries(
        ["Content-Type", "Content-Disposition", "Cache-Control", "X-Content-Type-Options"].map(
          (key) => [key, result.headers.get(key) ?? ""]
        )
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
