import { badRequest, run } from "../shared";
import { BackendError, fraudBackend, workspaceHeaders } from '@/services/fraud-backend';
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
    const response = await fetch(
      `${process.env.RISKLENS_BACKEND_URL ?? "http://127.0.0.1:8000"}/forms`,
      { method: "POST", headers: await workspaceHeaders(), body: upload, signal: AbortSignal.timeout(110000) }
    );
    const payload = await response.json();
    if (!response.ok) throw new BackendError(payload.error ?? "Form extraction failed.",response.status);
    return payload;
  });
}

export async function PATCH(request: Request) {
  return run(async () => {
    const body = await request.json();
    if (typeof body.id !== 'string' || !/^FORM-[a-zA-Z0-9]+$/.test(body.id)) throw new Error('Select a form draft.');
    return fraudBackend(`forms/${body.id}`,body.fields,'PATCH');
  });
}
