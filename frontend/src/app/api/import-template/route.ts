import { backendRequest, readBackendJson } from "@/shared/api/server";
import { badRequest, errorResponse } from "@/shared/api/route-helpers";
export async function GET(request: Request) {
  const entity = new URL(request.url).searchParams.get("entity") ?? "customers";
  const dataset = new URL(request.url).searchParams.get("dataset") ?? "meridian";
  if (!["meridian", "bankshield"].includes(dataset))
    return badRequest("Choose a supported dataset.");
  if (!["customers", "accounts", "transactions", "loans"].includes(entity))
    return badRequest("Choose a record type.");
  try {
    const response = await backendRequest(
      `data/imports/template?entity=${entity}&datasetId=${dataset}`,
      { signal: request.signal },
      10000
    );
    if (!response.ok) await readBackendJson(response);
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bankweave-${entity}-template.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
