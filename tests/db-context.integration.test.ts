import 'dotenv/config';
import { it, expect } from 'vitest';
import { createDb, db, dbContext } from '../src/lib/db';

it('keeps concurrent Worker request clients and transactions isolated', async () => {
  const target = new URL(process.env.DATABASE_URL ?? '');
  if (target.hostname !== '127.0.0.1' || target.port !== '55432')
    throw new Error('Integration solo permite PostgreSQL local en 127.0.0.1:55432.');
  const clients = [createDb(process.env.DATABASE_URL!, 1), createDb(process.env.DATABASE_URL!, 1)];
  try {
    const results = await Promise.all(
      clients.map((client, index) =>
        dbContext.run(client, async () => {
          expect(dbContext.getStore()).toBe(client);
          return db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('application_name', ${`worker-test-${index}`}, true)`;
            await tx.$queryRaw`SELECT pg_sleep(0.02)::text`;
            const result = await tx.$queryRaw<
              { name: string }[]
            >`SELECT current_setting('application_name') AS name`;
            expect(dbContext.getStore()).toBe(client);
            return result[0].name;
          });
        }),
      ),
    );
    expect(results).toEqual(['worker-test-0', 'worker-test-1']);
    expect(dbContext.getStore()).toBeUndefined();
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
});
