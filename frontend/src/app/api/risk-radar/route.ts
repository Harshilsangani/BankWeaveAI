import { bankingBackend } from "@/shared/api/server";
import { datasetQuery, run } from "@/shared/api/route-helpers";

export async function GET(request: Request) {
  return run(() => bankingBackend(`risk-radar${datasetQuery(request)}`));
}
