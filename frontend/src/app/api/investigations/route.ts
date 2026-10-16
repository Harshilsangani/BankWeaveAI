import type { QueryContext } from "@/shared/types/scope";
import { badRequest, isRecord, readJson, run } from "@/shared/api/route-helpers";
import { bankingBackend } from "@/shared/api/server";
export async function GET(request: Request) {
  return run(() =>
    bankingBackend(
      `saved-investigations/${encodeURIComponent(new URL(request.url).searchParams.get("id") ?? "")}`
    )
  );
}

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body) || typeof body.riskId !== "string" || !body.riskId)
    return badRequest("Choose a valid risk event to investigate.");
  if (body.scope !== undefined && !isRecord(body.scope))
    return badRequest("The investigation scope is invalid.");
  const riskId = body.riskId;
  const scope = body.scope as QueryContext | undefined;
  return run(() =>
    bankingBackend("investigations", { riskId, scope: scope ?? { domain: "fraud" } })
  );
}
