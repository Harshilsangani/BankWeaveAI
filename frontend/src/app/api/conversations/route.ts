import { bankingBackend } from "@/shared/api/server";
import { run } from "@/shared/api/route-helpers";

export async function GET() {
  return run(() => bankingBackend("conversations"));
}
export async function POST(request: Request) {
  return run(async () => bankingBackend("conversations", await request.json(), "POST"));
}
export async function PATCH(request: Request) {
  return run(async () => bankingBackend("conversations", await request.json(), "PATCH"));
}
