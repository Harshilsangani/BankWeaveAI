import { badRequest, isRecord, readJson, run } from "@/shared/api/route-helpers";
import { bankingBackend } from "@/shared/api/server";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body) || !isRecord(body.investigation))
    return badRequest("Open an investigation before creating a report.");
  const investigationId = body.investigation.id;
  if (typeof investigationId !== "string" || !investigationId || investigationId.length > 80)
    return badRequest("Choose a valid saved investigation.");
  if (body.scenario !== undefined && (!isRecord(body.scenario) || !isRecord(body.scenario.input)))
    return badRequest("Supply valid scenario inputs.");
  return run(() =>
    bankingBackend("reports", {
      investigationId,
      ...(isRecord(body.scenario) ? { scenarioInput: body.scenario.input } : {}),
    })
  );
}
