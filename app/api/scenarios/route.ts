import { mockService } from "@/services/mock";
import type { ScenarioInput } from "@/types";
import { badRequest, isRecord, readJson, run } from "../shared";
import { fraudBackend } from "@/services/fraud-backend";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body)) return badRequest("The scenario input is invalid.");
  if (body.riskId !== "RSK-002") return run(() => fraudBackend("scenarios", body));
  // Range and domain checks live in the service so HTTP and direct callers
  // share one rule set; failures surface here as 400s with the same messages.
  return run(() => mockService.runScenario(body as unknown as ScenarioInput));
}
