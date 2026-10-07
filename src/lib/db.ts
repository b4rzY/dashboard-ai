import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AsyncLocalStorage } from 'node:async_hooks';

const globalDb = globalThis as unknown as {
  gozoDb?: PrismaClient;
  gozoDbContext?: AsyncLocalStorage<PrismaClient>;
};

// The Worker entry point and Next bundle share this store across bundled modules.
export const dbContext = (globalDb.gozoDbContext ??= new AsyncLocalStorage<PrismaClient>());

export function createDb(connectionString: string, max = 5) {
  if (!connectionString) throw new Error('PostgreSQL no está configurado.');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max, connectionTimeoutMillis: 15000 }),
  });
}

function currentDb() {
  const requestDb = dbContext.getStore();
  if (requestDb) return requestDb;
  if (process.env.CLOUDFLARE_WORKER === 'true')
    throw new Error('La conexión PostgreSQL requiere un contexto de solicitud.');
  return (globalDb.gozoDb ??= createDb(process.env.DATABASE_URL ?? ''));
}

// Node uses one pool; Workers use a separate client for every request/event.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = currentDb();
    const value = Reflect.get(client, property);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
