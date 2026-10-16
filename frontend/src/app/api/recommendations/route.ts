import { bankingBackend } from "@/shared/api/server";
import { run } from "@/shared/api/route-helpers";
const valid = (id: unknown) => typeof id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(id);
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!valid(id)) return Response.json({ error: "Select a customer." }, { status: 400 });
  return run(() => bankingBackend(`recommendations/${id}`));
}
export async function PATCH(request: Request) {
  return run(async () => {
    const { id, action, recommendationId, ...body } = await request.json();
    if (!valid(id) || !["preferences", "review"].includes(action))
      throw new Error("Select a supported customer review.");
    if (action === "review" && !valid(recommendationId)) throw new Error("Select a suggestion.");
    return bankingBackend(
      action === "preferences" ? `preferences/${id}` : `recommendations/${id}/${recommendationId}`,
      body,
      "PATCH"
    );
  });
}
