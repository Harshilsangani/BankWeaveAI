import { bankingBackend } from "@/shared/api/server";
import { run } from "@/shared/api/route-helpers";
export async function GET() {
  return run(() => bankingBackend("identity"));
}
