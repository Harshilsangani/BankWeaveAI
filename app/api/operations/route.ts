import { workspaceHeaders } from '@/services/fraud-backend';
export const maxDuration = 120;
const base = process.env.RISKLENS_BACKEND_URL ?? 'http://127.0.0.1:8000';
export async function POST(request: Request) {
  try {
    let path: string, body: BodyInit, headers = new Headers(await workspaceHeaders());
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      if (Number(request.headers.get('content-length')) > 9*1024*1024) throw new Error('Upload a form up to 8 MB.');
      const form=await request.formData(), file=form.get('file');
      if (!(file instanceof File) || !file.size || file.size>8*1024*1024) throw new Error('Upload a non-empty form up to 8 MB.');
      const upload=new FormData(); upload.set('file',file); body=upload; path='forms/stream';
    } else {
      const input=await request.json();
      if (!['query','investigation'].includes(input.kind)) throw new Error('Select a supported operation.');
      path=input.kind==='query'?'analyst/stream':'investigations/stream';
      headers.set('Content-Type','application/json'); body=JSON.stringify(input.payload);
    }
    const upstream=await fetch(`${base}/${path}`,{method:'POST',headers,body,cache:'no-store',signal:AbortSignal.any([request.signal,AbortSignal.timeout(115000)])});
    if (!upstream.ok) {
      const error=await upstream.json();
      return Response.json({error:error.error ?? (typeof error.detail==='string'?error.detail:'Check the supplied operation inputs.')},{status:upstream.status});
    }
    return new Response(upstream.body,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:'Operation unavailable.'},{status:502});
  }
}
export async function DELETE(request:Request) {
  const id=new URL(request.url).searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) return Response.json({error:'Invalid request ID.'},{status:400});
  const response=await fetch(`${base}/operations/${id}`,{method:'DELETE',headers:await workspaceHeaders(),signal:AbortSignal.timeout(10000)});
  return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json'}});
}
