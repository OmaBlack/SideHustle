import { randomUUID } from 'node:crypto';
import swagger from '@fastify/swagger';
import type { Database } from '@sidehustle/db';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { Config } from './config.js';
import { registerErrorHandler } from './errors.js';
import { healthRoutes } from './modules/health/routes.js';

export interface Deps {
  config: Config;
  db: Database;
  redis: Redis;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: Deps;
  }
}

const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export async function buildApp(deps: Deps) {
  const app = Fastify({
    logger:
      deps.config.NODE_ENV === 'test'
        ? false
        : { level: deps.config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    // Correlation id: reuse a sane incoming X-Request-Id, otherwise mint one; it is echoed back and on every log line.
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
    requestIdHeader: false,
  }).withTypeProvider<ZodTypeProvider>();

  app.decorate('deps', deps);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });
  registerErrorHandler(app);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'SideHustle API', version: deps.config.APP_VERSION },
      servers: [{ url: '/' }],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
      v1.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
    },
    { prefix: '/v1' },
  );

  return app;
}
