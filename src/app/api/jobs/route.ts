import { validCron } from '@/lib/auth';
import { processSyncJobs } from '@/services/sync';
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!validCron(request)) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (process.env.DEMO_MODE === 'true') return Response.json({ skipped: true });
  return Response.json({ results: await processSyncJobs() });
}
