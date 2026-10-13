import { fraudBackend } from "@/services/fraud-backend";
import { datasetQuery, run } from "../shared";

export async function GET(request: Request) {
  return run(() => fraudBackend(`dashboard${datasetQuery(request)}`));
}
