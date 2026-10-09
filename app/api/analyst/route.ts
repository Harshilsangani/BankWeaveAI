import type { QueryContext } from "@/types";
import { badRequest, isRecord, readJson, run } from "../shared";
import { fraudBackend } from "@/services/fraud-backend";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body) || typeof body.query !== "string" || !body.query.trim())
    return badRequest("Enter a banking question to start an analysis.");
  const query = body.query;
  const context = body.context as QueryContext | undefined;
  if (query.length > 1000) return badRequest("Keep the question within 1,000 characters.");
  if (body.context !== undefined && !isRecord(body.context))
    return badRequest("Invalid query context.");
  return run(() => fraudBackend("analyst", { query, context: context ?? { domain: "fraud" } }));
}
