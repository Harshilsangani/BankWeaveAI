import { bankingBackend } from "@/shared/api/server";
import { run } from "@/shared/api/route-helpers";
const valid = (id: unknown) => typeof id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(id);
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!valid(id)) return Response.json({ error: "Select a customer." }, { status: 400 });
  return run(() => bankingBackend(`kyc/customer/${id}`));
}
export async function POST(request: Request) {
  return run(async () => {
    const { id, ...body } = await request.json();
    if (!valid(id)) throw new Error("Select a customer.");
    return bankingBackend(`kyc/customer/${id}`, body);
  });
}
export async function PATCH(request: Request) {
  return run(async () => {
    const { id, ...body } = await request.json();
    if (!valid(id)) throw new Error("Select a KYC case.");
    return bankingBackend(`kyc/${id}`, body, "PATCH");
  });
}
