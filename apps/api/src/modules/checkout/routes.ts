import { schema } from '@sidehustle/db';
import { CheckoutInput, CreateOrderInput } from '@sidehustle/schemas';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { HttpProblem } from '../../errors.js';
import { requireUser } from '../../lib/auth.js';
import { sha256 } from '../../lib/crypto.js';
import { notFound } from '../../lib/problems.js';
import { rateLimit } from '../../lib/ratelimit.js';
import { daysFromNow } from '../../lib/time.js';
import { orderViews } from '../orders/view.js';
import { assertOwner, createOrder, createQuote } from './service.js';

export const checkoutRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, redis, payments } = app.deps;

  app.post('/checkout/quote', { schema: { tags: ['checkout'], body: CheckoutInput } }, async (req) => {
    const u = requireUser(req);
    await rateLimit(redis, 'checkoutQuote', u.id);
    return { quote: await createQuote(db, u, req.body) };
  });

  const initPayment = async (
    order: typeof schema.orders.$inferSelect,
    email: string,
    log: { error: (o: object, m: string) => void },
  ) => {
    try {
      const r = await payments.initialize({
        reference: order.ref,
        amountKobo: order.totalKobo,
        email,
        channels: ['card', 'bank_transfer'],
      });
      return { authorizationUrl: r.authorizationUrl, accessCode: r.accessCode ?? null };
    } catch (err) {
      // The order stays pending; the buyer can retry from the order page (UC-1 alternate).
      log.error({ err, ref: order.ref }, 'payment initialize failed');
      return null;
    }
  };

  // FR-CHK-07: Idempotency-Key required; the same key and body replay the first response.
  app.post(
    '/orders',
    {
      schema: {
        tags: ['orders'],
        body: CreateOrderInput,
        headers: z.object({ 'idempotency-key': z.string().min(8).max(100) }).passthrough(),
      },
    },
    async (req, reply) => {
      const u = requireUser(req);
      const key = req.headers['idempotency-key'] as string;
      const hash = sha256(JSON.stringify(req.body));
      const [seen] = await db
        .select()
        .from(schema.idempotencyKeys)
        .where(
          and(
            eq(schema.idempotencyKeys.userId, u.id),
            eq(schema.idempotencyKeys.key, key),
            gt(schema.idempotencyKeys.expiresAt, new Date()),
          ),
        );
      if (seen) {
        if (seen.requestHash !== hash)
          throw new HttpProblem(422, 'IDEMPOTENCY_MISMATCH', 'This key was used for a different request');
        if (seen.response) return reply.status(seen.responseStatus ?? 200).send(seen.response);
      }
      await rateLimit(redis, 'orderCreate', u.id);
      const { order, created } = await createOrder(db, u, req.body.quoteId, payments.name);
      const payment = order.status === 'pending_payment' ? await initPayment(order, u.email, req.log) : null;
      const [view] = await orderViews(db, [order]);
      const body = { order: view, payment };
      const status = created ? 201 : 200;
      await db
        .insert(schema.idempotencyKeys)
        .values({
          key,
          userId: u.id,
          requestHash: hash,
          responseStatus: status,
          response: body,
          expiresAt: daysFromNow(1),
        })
        .onConflictDoNothing();
      return reply.status(status).send(body);
    },
  );

  app.get('/orders', { schema: { tags: ['orders'] } }, async (req) => {
    const u = requireUser(req);
    const rows = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.buyerId, u.id))
      .orderBy(desc(schema.orders.createdAt))
      .limit(100);
    return { orders: await orderViews(db, rows) };
  });

  const own = async (ref: string, userId: string) => {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.ref, ref));
    if (!o) throw notFound('Order not found');
    assertOwner(o, { id: userId } as never);
    return o;
  };

  app.get(
    '/orders/:ref',
    { schema: { tags: ['orders'], params: z.object({ ref: z.string().max(20) }) } },
    async (req) => {
      const u = requireUser(req);
      const o = await own(req.params.ref, u.id);
      const [view] = await orderViews(db, [o]);
      return { order: view };
    },
  );

  // Retry payment on a pending order (UC-1 alternate: payment fails, buyer retries or changes method).
  app.post(
    '/orders/:ref/pay',
    { schema: { tags: ['orders'], params: z.object({ ref: z.string().max(20) }) } },
    async (req) => {
      const u = requireUser(req);
      const o = await own(req.params.ref, u.id);
      if (o.status !== 'pending_payment')
        throw new HttpProblem(409, 'NOT_PENDING', 'This order is not waiting for payment');
      return { payment: await initPayment(o, u.email, req.log) };
    },
  );
};
