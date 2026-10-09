import {fraudBackend} from '@/services/fraud-backend';
import {run} from '../shared';
export async function GET(request:Request){const id=new URL(request.url).searchParams.get('id');if(!id || !/^[a-zA-Z0-9-]{1,80}$/.test(id))return Response.json({error:'Select a customer.'},{status:400});return run(()=>fraudBackend(`repayments/${id}`));}
