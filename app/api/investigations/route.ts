import type { QueryContext } from "@/types";
import { badRequest, isRecord, readJson, run } from "../shared";
import { fraudBackend } from "@/services/fraud-backend";
export async function GET(request:Request) {return run(()=>fraudBackend(`saved-investigations/${encodeURIComponent(new URL(request.url).searchParams.get('id') ?? '')}`));}

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body) || typeof body.riskId !== "string" || !body.riskId)
    return badRequest("Choose a valid risk event to investigate.");
  if (body.scope !== undefined && !isRecord(body.scope))
    return badRequest("The investigation scope is invalid.");
  const riskId = body.riskId;
  const scope = body.scope as QueryContext | undefined;
  return run(() => fraudBackend("investigations", { riskId, scope: scope ?? { domain: "fraud" } }));
}
