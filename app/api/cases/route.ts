import { fraudBackend } from '@/services/fraud-backend';
import { run } from '../shared';
export async function GET(request:Request) {
  return run(()=>fraudBackend(`cases/${encodeURIComponent(new URL(request.url).searchParams.get('id') ?? '')}`));
}
export async function PATCH(request:Request) {
  return run(async()=>{const {id,...body}=await request.json();return fraudBackend(`cases/${encodeURIComponent(id)}`,body,'PATCH');});
}
