import { fraudBackend } from '@/services/fraud-backend';
import { run } from '../shared';
export async function GET() { return run(() => fraudBackend('session')); }
export async function PATCH(request: Request) { return run(async () => fraudBackend('session',await request.json(),'PATCH')); }
