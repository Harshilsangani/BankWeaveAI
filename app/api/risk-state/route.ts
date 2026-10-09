import {fraudBackend} from '@/services/fraud-backend';
import {run} from '../shared';
export async function GET(){return run(()=>fraudBackend('risk-state'));}
export async function PATCH(request:Request){return run(async()=>fraudBackend('risk-state',await request.json(),'PATCH'));}
