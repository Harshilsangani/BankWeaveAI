import { mockService } from "@/services/mock";
import type { Investigation, ScenarioResult } from "@/types";
import { badRequest, isRecord, readJson, run } from "../shared";
import { fraudBackend } from "@/services/fraud-backend";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body) || !isRecord(body.investigation))
    return badRequest("Open an investigation before creating a report.");
  const investigation = body.investigation as unknown as Investigation;
  const scenario = body.scenario as ScenarioResult | undefined;
  if (typeof investigation.id !== "string" || typeof investigation.title !== "string") return badRequest("Choose a valid saved investigation.");
  if (investigation.analysis) return run(() => fraudBackend("reports", { investigationId: investigation.id, ...(scenario ? { scenarioInput: scenario.input } : {}) }));
  return run(() => mockService.generateReport(investigation, scenario));
}
