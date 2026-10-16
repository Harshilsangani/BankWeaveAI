import { badRequest, isRecord, readJson, run } from "@/shared/api/route-helpers";
import { bankingBackend } from "@/shared/api/server";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body)) return badRequest("The scenario input is invalid.");
  return run(() => bankingBackend("scenarios", body));
}
