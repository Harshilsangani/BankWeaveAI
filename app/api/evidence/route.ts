import { fraudBackend } from "@/services/fraud-backend";
import { badRequest, isRecord, readJson, run } from "../shared";
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body)) return badRequest("Invalid evidence request.");
  return run(() => fraudBackend("evidence", body));
}
