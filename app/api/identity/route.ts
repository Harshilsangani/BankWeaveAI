import { fraudBackend } from '@/services/fraud-backend';
import { run } from '../shared';
export async function GET() { return run(() => fraudBackend('identity')); }
