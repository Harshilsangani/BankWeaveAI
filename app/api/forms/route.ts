import { badRequest, run } from "../shared";
import { backendRequest, fraudBackend, readBackendJson } from "@/services/fraud-backend";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 9 * 1024 * 1024)
    return badRequest("Upload a form up to 8 MB.");
  return run(async () => {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024)
      throw new Error("Upload a non-empty PDF or image up to 8 MB.");
    const upload = new FormData();
    upload.set("file", file);
    return readBackendJson(
      await backendRequest(
        "forms",
        { method: "POST", body: upload, signal: request.signal },
        110000
      )
    );
  });
}

export async function PATCH(request: Request) {
  return run(async () => {
    const body = await request.json();
    if (typeof body.id !== "string" || !/^FORM-[a-zA-Z0-9]+$/.test(body.id))
      throw new Error("Select a form draft.");
    return fraudBackend(`forms/${body.id}`, body.fields, "PATCH");
  });
}
