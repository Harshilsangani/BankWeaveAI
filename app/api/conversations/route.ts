import { fraudBackend } from "@/services/fraud-backend";
import { run } from "../shared";

export async function GET() {
  return run(() => fraudBackend("conversations"));
}
export async function POST(request: Request) {
  return run(async () => fraudBackend("conversations", await request.json(), "POST"));
}
export async function PATCH(request: Request) {
  return run(async () => fraudBackend("conversations", await request.json(), "PATCH"));
}
