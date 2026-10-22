import { schema } from '@sidehustle/db';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { HttpProblem } from '../../errors.js';
import { requireUser } from '../../lib/auth.js';
import { DevProvider } from '../../lib/payments/provider.js';
import { forbidden } from '../../lib/problems.js';
import { processPaymentSuccess, processRefunds } from './service.js';

export const paymentRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, payments } = app.deps;

  // The signature covers the exact bytes, so this scope keeps the raw body.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8') || '{}'));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post('/payments/webhook/paystack', { schema: { tags: ['payments'] } }, async (req, reply) => {
    if (payments.name !== 'paystack') throw forbidden('Paystack is not configured');
    const raw = (req as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    if (!payments.verifyWebhook(raw, req.headers))
      throw new HttpProblem(401, 'BAD_SIGNATURE', 'Signature check failed');
    const evt = payments.parseWebhook(req.body);
    if (evt.kind !== 'charge.success') return reply.status(200).send({ ok: true, ignored: true });
    // Never trust the event alone: confirm with the provider (FR-CHK-06).
    const v = await payments.verify(evt.reference);
    if (v.status !== 'success') return reply.status(200).send({ ok: true, ignored: true });
    const { outcome, refundIds } = await processPaymentSuccess(db, {
      reference: evt.reference,
      amountKobo: v.amountKobo,
      currency: v.currency,
      channel: v.channel,
      raw: evt.raw,
    });
    await processRefunds(db, payments, refundIds);
    return reply.status(200).send({ ok: true, outcome });
  });

  // Dev provider only: stands in for a verified webhook so the full flow runs without Paystack keys.
  app.post(
    '/payments/dev/:ref/complete',
    { schema: { tags: ['payments'], params: z.object({ ref: z.string().max(20) }) } },
    async (req) => {
      if (!(payments instanceof DevProvider) || !app.deps.config.DEV_TOOLS) throw forbidden();
      const u = requireUser(req);
      const [o] = await db.select().from(schema.orders).where(eq(schema.orders.ref, req.params.ref));
      if (!o) throw new HttpProblem(404, 'NOT_FOUND', 'Order not found');
      if (o.buyerId !== u.id) throw forbidden();
      payments.paid.set(o.ref, o.totalKobo);
      const { outcome, refundIds } = await processPaymentSuccess(db, {
        reference: o.ref,
        amountKobo: o.totalKobo,
        currency: 'NGN',
        channel: 'dev',
      });
      await processRefunds(db, payments, refundIds);
      return { outcome };
    },
  );
};
