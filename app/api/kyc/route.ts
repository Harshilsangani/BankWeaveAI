import {fraudBackend} from '@/services/fraud-backend';
import {run} from '../shared';
const valid=(id:unknown)=>typeof id==='string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
export async function GET(request:Request){const id=new URL(request.url).searchParams.get('id');if(!valid(id))return Response.json({error:'Select a customer.'},{status:400});return run(()=>fraudBackend(`kyc/customer/${id}`));}
export async function POST(request:Request){return run(async()=>{const {id,...body}=await request.json();if(!valid(id))throw new Error('Select a customer.');return fraudBackend(`kyc/customer/${id}`,body);});}
export async function PATCH(request:Request){return run(async()=>{const {id,...body}=await request.json();if(!valid(id))throw new Error('Select a KYC case.');return fraudBackend(`kyc/${id}`,body,'PATCH');});}
