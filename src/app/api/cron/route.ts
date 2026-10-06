import { validCron } from '@/lib/auth';
import { syncAllBankConnections, processSyncJobs } from '@/services/sync';
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!validCron(request)) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (process.env.DEMO_MODE === 'true') return Response.json({ skipped: true });
  try {
    const results = await syncAllBankConnections();
    return Response.json({ results });
  } catch {
    return Response.json({ error: 'Error en la cola de sincronización' }, { status: 500 });
  }
}
export async function POST(request: Request) {
  if (!validCron(request)) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (process.env.DEMO_MODE === 'true') return Response.json({ skipped: true });
  return Response.json({ results: await processSyncJobs() });
}
