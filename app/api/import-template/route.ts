import { workspaceHeaders } from "@/services/fraud-backend";
import { badRequest } from "../shared";
export async function GET(request: Request) {
  const entity = new URL(request.url).searchParams.get("entity") ?? "customers";
  const dataset = new URL(request.url).searchParams.get("dataset") ?? "meridian";
  if (!["meridian", "bankshield"].includes(dataset))
    return badRequest("Choose a supported dataset.");
  if (!["customers", "accounts", "transactions", "loans"].includes(entity))
    return badRequest("Choose a record type.");
  try {
    const response = await fetch(
      `${process.env.RISKLENS_BACKEND_URL ?? "http://127.0.0.1:8000"}/data/imports/template?entity=${entity}&datasetId=${dataset}`,
      { headers: await workspaceHeaders(), signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return badRequest("The template could not be loaded.");
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bankweave-${entity}-template.csv"`,
      },
    });
  } catch {
    return badRequest("The template service is unavailable.");
  }
}
