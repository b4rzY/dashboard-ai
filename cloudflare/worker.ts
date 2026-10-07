// @ts-expect-error OpenNext generates this module during cloudflare:build.
import handler from '../.open-next/worker.js';
import { createDb, dbContext } from '../src/lib/db';

type Environment = {
  DATABASE_URL?: string;
  HYPERDRIVE?: { connectionString: string };
  APP_URL: string;
  CRON_SECRET?: string;
};
type Context = { waitUntil(promise: Promise<unknown>): void };

async function fetchWithDatabase(request: Request, env: Environment, ctx: Context) {
  const client = createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL ?? '', 2);
  let disconnected = false;
  const disconnect = () => {
    if (!disconnected) {
      disconnected = true;
      ctx.waitUntil(client.$disconnect());
    }
  };
  try {
    const response: Response = await dbContext.run(client, () => handler.fetch(request, env, ctx));
    if (!response.body) {
      disconnect();
      return response;
    }
    const reader = response.body.getReader();
    // Keep request-scoped connections alive until a streamed response has finished.
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await dbContext.run(client, () => reader.read());
          if (result.done) {
            controller.close();
            disconnect();
          } else controller.enqueue(result.value);
        } catch (error) {
          controller.error(error);
          disconnect();
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          disconnect();
        }
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    disconnect();
    throw error;
  }
}

const worker = {
  fetch: fetchWithDatabase,
  async scheduled(event: { cron: string }, env: Environment, ctx: Context) {
    if (!env.CRON_SECRET || env.CRON_SECRET.length < 32)
      throw new Error('Configura CRON_SECRET para la sincronización automática.');
    const path = event.cron === '0 */4 * * *' ? '/api/cron' : '/api/jobs';
    const response = await fetchWithDatabase(
      new Request(new URL(path, env.APP_URL), {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }),
      env,
      ctx,
    );
    await response.arrayBuffer();
    if (!response.ok)
      throw new Error(`La sincronización programada terminó con estado ${response.status}.`);
  },
};
export default worker;
