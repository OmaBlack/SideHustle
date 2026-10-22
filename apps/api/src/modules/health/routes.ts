import { Health } from '@sidehustle/schemas';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/** Resolves 'ok' or 'fail'; never rejects, never waits longer than `ms`. */
async function probe(check: () => Promise<boolean>, ms: number): Promise<'ok' | 'fail'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return (await Promise.race([check(), timeout])) ? 'ok' : 'fail';
  } catch {
    return 'fail';
  } finally {
    clearTimeout(timer);
  }
}

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['ops'],
        summary: 'Liveness and dependency check',
        response: { 200: Health, 503: Health },
      },
    },
    async (_req, reply) => {
      const ms = app.deps.config.HEALTH_TIMEOUT_MS;
      const [database, redis] = await Promise.all([
        probe(async () => (await app.deps.db.execute(sql`select 1`), true), ms),
        probe(async () => (await app.deps.redis.ping()) === 'PONG', ms),
      ]);
      const checks = { database, redis };
      const ok = Object.values(checks).every((c) => c === 'ok');
      return reply
        .status(ok ? 200 : 503)
        .send({ status: ok ? 'ok' : 'degraded', version: app.deps.config.APP_VERSION, checks });
    },
  );
};
