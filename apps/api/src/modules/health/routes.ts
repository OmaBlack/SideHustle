import { Health } from '@sidehustle/schemas';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

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
      const checks: Record<string, 'ok' | 'fail'> = {};
      try {
        await app.deps.db.execute(sql`select 1`);
        checks.database = 'ok';
      } catch {
        checks.database = 'fail';
      }
      try {
        checks.redis = (await app.deps.redis.ping()) === 'PONG' ? 'ok' : 'fail';
      } catch {
        checks.redis = 'fail';
      }
      const ok = Object.values(checks).every((c) => c === 'ok');
      return reply
        .status(ok ? 200 : 503)
        .send({ status: ok ? 'ok' : 'degraded', version: app.deps.config.APP_VERSION, checks });
    },
  );
};
