import { fraudBackend } from '@/services/fraud-backend';
import { run } from "../shared";

export async function GET() {
  return run(() => fraudBackend('policies'));
}
export async function POST(request:Request) {return run(async()=>fraudBackend('policies',await request.json()));}
