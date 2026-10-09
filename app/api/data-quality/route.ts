import {fraudBackend} from '@/services/fraud-backend';
import {run} from '../shared';
export async function GET(request:Request){const dataset=new URL(request.url).searchParams.get('dataset') ?? 'meridian';return run(()=>fraudBackend(`data/quality?datasetId=${encodeURIComponent(dataset)}`));}
export async function POST(request:Request){return run(async()=>{const {action,...body}=await request.json();if(!['preview','confirm'].includes(action))throw new Error('Select preview or confirm.');return fraudBackend(`data/imports/${action}`,body);});}
