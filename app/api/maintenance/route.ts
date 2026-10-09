import { fraudBackend } from "@/services/fraud-backend";
import { run } from "../shared";
const valid = (id: unknown) => typeof id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(id);
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!valid(id)) return Response.json({ error: "Select a customer." }, { status: 400 });
  return run(() => fraudBackend(`maintenance/${id}`));
}
export async function POST(request: Request) {
  return run(async () => {
    const { id, action, policyId, ...body } = await request.json();
    if (
      !valid(id) ||
      !["accounts", "policies", "policy_update", "payments", "reverse"].includes(action)
    )
      throw new Error("Select a supported record workflow.");
    if (action === "policy_update" && !valid(policyId)) throw new Error("Select a policy.");
    return fraudBackend(
      action === "policy_update"
        ? `maintenance/${id}/policies/${policyId}`
        : `maintenance/${id}/${action}`,
      body,
      action === "policy_update" ? "PATCH" : "POST"
    );
  });
}
