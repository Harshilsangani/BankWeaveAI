import {workspaceHeaders} from '@/services/fraud-backend';
export async function GET(request:Request) {
  const id=new URL(request.url).searchParams.get('id');
  if(!id || !/^RPT-[a-zA-Z0-9]+$/.test(id)) return Response.json({error:'Select a saved report.'},{status:400});
  try {
    const result=await fetch(`${process.env.RISKLENS_BACKEND_URL ?? 'http://127.0.0.1:8000'}/reports/${id}/download`,{headers:await workspaceHeaders(),cache:'no-store',signal:AbortSignal.timeout(20000)});
    return new Response(result.body,{status:result.status,headers:Object.fromEntries(['Content-Type','Content-Disposition','Cache-Control','ETag','X-Content-Type-Options','Content-Security-Policy'].map(key=>[key,result.headers.get(key) ?? '']))});
  }catch{return Response.json({error:'Report service is unavailable.'},{status:502});}
}
