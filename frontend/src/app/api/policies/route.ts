import { bankingBackend } from "@/shared/api/server";
import { run } from "@/shared/api/route-helpers";

export async function GET() {
  return run(() => bankingBackend("policies"));
}
export async function POST(request: Request) {
  return run(async () => bankingBackend("policies", await request.json()));
}
