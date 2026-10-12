import { badRequest, isRecord, readJson, run } from "../shared";
import { fraudBackend } from "@/services/fraud-backend";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body)) return badRequest("The scenario input is invalid.");
  return run(() => fraudBackend("scenarios", body));
}
