import { bankingBackend } from "@/shared/api/server";
import { run } from "@/shared/api/route-helpers";
export async function GET() {
  return run(() => bankingBackend("session"));
}
export async function PATCH(request: Request) {
  return run(async () => bankingBackend("session", await request.json(), "PATCH"));
}
