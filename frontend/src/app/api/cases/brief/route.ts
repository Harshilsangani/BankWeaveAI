import { backendRequest, readBackendJson } from "@/shared/api/server";
import { badRequest, isRecord, readJson, run } from "@/shared/api/route-helpers";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return badRequest("Choose a saved investigation.");
  return run(async () =>
    readBackendJson(await backendRequest(`cases/${encodeURIComponent(id)}/brief`))
  );
}

export async function POST(request: Request) {
  const payload = await readJson(request);
  if (!isRecord(payload) || typeof payload.id !== "string" || !payload.id)
    return badRequest("Choose a saved investigation.");
  const { id, ...body } = payload;
  return run(async () =>
    readBackendJson(
      await backendRequest(
        `cases/${encodeURIComponent(id)}/brief`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        85000
      )
    )
  );
}
