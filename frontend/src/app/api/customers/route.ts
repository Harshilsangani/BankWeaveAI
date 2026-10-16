import { bankingBackend } from "@/shared/api/server";
import { badRequest, isRecord, readJson, run } from "@/shared/api/route-helpers";
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body) || body.confirmed !== true)
    return badRequest("Review and explicitly confirm the customer draft.");
  return run(() => bankingBackend("customers", body));
}
export async function GET() {
  return run(() => bankingBackend("customers"));
}
