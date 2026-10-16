import { bankingBackend } from "@/shared/api/server";
import { run } from "@/shared/api/route-helpers";
export async function GET(request: Request) {
  const dataset = new URL(request.url).searchParams.get("dataset") ?? "meridian";
  return run(() => bankingBackend(`data/quality?datasetId=${encodeURIComponent(dataset)}`));
}
export async function POST(request: Request) {
  return run(async () => {
    const { action, ...body } = await request.json();
    if (!["preview", "confirm"].includes(action)) throw new Error("Select preview or confirm.");
    return bankingBackend(`data/imports/${action}`, body);
  });
}
