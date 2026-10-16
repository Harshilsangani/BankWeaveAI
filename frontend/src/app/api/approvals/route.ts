import { bankingBackend } from "@/shared/api/server";
import { badRequest, isRecord, readJson, run } from "@/shared/api/route-helpers";

function validId(id: unknown): id is string {
  return typeof id === "string" && /^APPROVAL-[a-zA-Z0-9]+$/.test(id);
}
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const id = query.get("id");
  if (id && !validId(id)) return badRequest("Select a valid approval request.");
  return run(() =>
    bankingBackend(
      id
        ? `approvals/${id}`
        : `approvals?${new URLSearchParams({ status: query.get("status") ?? "pending", offset: query.get("offset") ?? "0" })}`
    )
  );
}
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!isRecord(body) || !validId(body.id)) return badRequest("Select an approval request.");
  const { id, ...decision } = body;
  return run(() => bankingBackend(`approvals/${id}/decision`, decision));
}
