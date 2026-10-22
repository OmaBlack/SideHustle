import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
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
import { HttpProblem, registerErrorHandler } from './errors.js';
import { registerAuth } from './lib/auth.js';
import { setRateLimitScale } from './lib/ratelimit.js';
import { DevProvider, PaystackProvider, type PaymentProvider } from './lib/payments/provider.js';
import { accountRoutes } from './modules/account/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { cartRoutes } from './modules/cart/routes.js';
import { catalogueRoutes } from './modules/catalogue/routes.js';
import { checkoutRoutes } from './modules/checkout/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { identityRoutes } from './modules/identity/routes.js';
import { paymentRoutes } from './modules/payments/routes.js';
import { requestRoutes } from './modules/requests/routes.js';
import { vendorRoutes } from './modules/vendor/routes.js';

export interface Deps {
  config: Config;
  db: Database;
  redis: Redis;
  /** Paystack when a secret key is set, otherwise the dev provider (refused in production by loadConfig). */
  payments: PaymentProvider;
}

export function defaultPaymentProvider(config: Config): PaymentProvider {
  return config.PAYSTACK_SECRET_KEY
    ? new PaystackProvider(config.PAYSTACK_SECRET_KEY, `${config.WEB_ORIGIN}/orders`)
    : new DevProvider(config.WEB_ORIGIN);
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: Deps;
  }
}

const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export async function buildApp(input: Omit<Deps, 'payments'> & { payments?: PaymentProvider }) {
  const deps: Deps = { ...input, payments: input.payments ?? defaultPaymentProvider(input.config) };
  setRateLimitScale(deps.config.RATE_LIMIT_SCALE);
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
    trustProxy: deps.config.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();

  app.decorate('deps', deps);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });
  registerErrorHandler(app);
  await app.register(cookie);
  // Baseline ceiling per IP for every route; sensitive actions keep their tighter limits in lib/ratelimit.ts.
  // The Redis store needs a real client; the OpenAPI generator passes a stub, so fall back to memory then.
  const realRedis = typeof (deps.redis as { defineCommand?: unknown }).defineCommand === 'function';
  await app.register(rateLimit, {
    global: true,
    max: 300 * deps.config.RATE_LIMIT_SCALE,
    timeWindow: '1 minute',
    nameSpace: 'rl:global:',
    keyGenerator: (req) => req.ip,
    ...(realRedis ? { redis: deps.redis } : {}),
    errorResponseBuilder: () =>
      new HttpProblem(429, 'RATE_LIMITED', 'Too many requests. Please wait and try again.'),
  });
  registerAuth(app);

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
      await v1.register(identityRoutes);
      await v1.register(accountRoutes);
      await v1.register(catalogueRoutes);
      await v1.register(cartRoutes);
      await v1.register(checkoutRoutes);
      await v1.register(paymentRoutes);
      await v1.register(requestRoutes);
      await v1.register(vendorRoutes);
      await v1.register(adminRoutes);
      v1.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
    },
    { prefix: '/v1' },
  );

  return app;
}
