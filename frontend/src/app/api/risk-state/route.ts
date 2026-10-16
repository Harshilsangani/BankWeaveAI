import { bankingBackend } from "@/shared/api/server";
import { datasetQuery, run } from "@/shared/api/route-helpers";
export async function GET(request: Request) {
  return run(() => bankingBackend(`risk-state${datasetQuery(request)}`));
}
export async function PATCH(request: Request) {
  return run(async () => bankingBackend("risk-state", await request.json(), "PATCH"));
}
