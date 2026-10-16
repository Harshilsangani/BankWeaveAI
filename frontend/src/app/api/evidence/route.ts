import { bankingBackend } from "@/shared/api/server";
import { badRequest, isRecord, readJson, run } from "@/shared/api/route-helpers";
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body)) return badRequest("Invalid evidence request.");
  return run(() => bankingBackend("evidence", body));
}
