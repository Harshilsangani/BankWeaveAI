import { fraudBackend } from "@/services/fraud-backend";
import { badRequest, isRecord, readJson, run } from "../shared";
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body) || body.confirmed !== true)
    return badRequest("Review and explicitly confirm the customer draft.");
  return run(() => fraudBackend("customers", body));
}
export async function GET() {
  return run(() => fraudBackend("customers"));
}
