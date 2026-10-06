import 'dotenv/config';
// Scripts use react-server condition to load server-only modules safely.
import { db } from '../src/lib/db';
import { syncAllBankConnections, processSyncJobs } from '../src/services/sync';
async function main() {
  if (process.env.DEMO_MODE === 'true') throw new Error('La demo no consulta Fintoc');
  await syncAllBankConnections();
  for (let i = 0; i < 100; i++) {
    const result = await processSyncJobs(2);
    if (!result.length) break;
  }
  console.log('Cola procesada. Revisar Conexiones y SyncRun para ver resultados.');
}
main().finally(() => db.$disconnect());
