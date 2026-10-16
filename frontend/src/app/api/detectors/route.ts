import { bankingBackend } from "@/shared/api/server";
import { datasetQuery, run } from "@/shared/api/route-helpers";
export async function GET(request: Request) {
  return run(() => bankingBackend(`detectors/latest${datasetQuery(request)}`));
}
export async function POST(request: Request) {
  return run(async () => bankingBackend("detectors/run", await request.json()));
}
