import {fraudBackend} from '@/services/fraud-backend';
import {run} from '../shared';
export async function GET(){return run(()=>fraudBackend('detectors/latest'));}
export async function POST(request:Request){return run(async()=>fraudBackend('detectors/run',await request.json()));}
