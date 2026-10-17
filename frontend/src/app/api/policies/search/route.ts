import { bankingBackend } from "@/shared/api/server";
import { run } from "@/shared/api/route-helpers";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return run(() => bankingBackend(`policies/search?q=${encodeURIComponent(query)}`));
}
