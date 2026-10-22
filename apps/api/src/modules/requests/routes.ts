import { schema } from '@sidehustle/db';
import { CustomRequestInput } from '@sidehustle/schemas';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireUser } from '../../lib/auth.js';
import { enqueue } from '../../lib/outbox.js';
import { badRequest } from '../../lib/problems.js';
import { rateLimit } from '../../lib/ratelimit.js';

export const requestRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, redis } = app.deps;

  // FR-VEN-03/04: login required, recorded as New, vendor notified.
  app.post('/requests', { schema: { tags: ['requests'], body: CustomRequestInput } }, async (req, reply) => {
    const u = requireUser(req);
    await rateLimit(redis, 'requestSubmit', u.id);
    const [v] = await db
      .select()
      .from(schema.vendors)
      .where(
        and(
          eq(schema.vendors.id, req.body.vendorId),
          eq(schema.vendors.status, 'verified'),
          isNull(schema.vendors.deletedAt),
        ),
      );
    if (!v || !v.acceptsCustom) throw badRequest('NO_CUSTOM_WORK', 'This vendor does not take custom orders');
    const row = await db.transaction(async (tx) => {
      const [r] = await tx
        .insert(schema.customRequests)
        .values({
          vendorId: v.id,
          buyerId: u.id,
          projectType: req.body.projectType,
          brief: req.body.brief,
          quantityEstimate: req.body.quantityEstimate ?? null,
        })
        .returning();
      await enqueue(
        tx,
        'notify.vendor',
        { to: v.id, template: 'vendor_new_request', data: { projectType: req.body.projectType } },
        `vendor_new_request:${r!.id}`,
      );
      return r!;
    });
    return reply.status(201).send({ request: row });
  });

  app.get('/me/requests', { schema: { tags: ['requests'] } }, async (req) => {
    const u = requireUser(req);
    const rows = await db
      .select({ r: schema.customRequests, vendorName: schema.vendors.name, vendorSlug: schema.vendors.slug })
      .from(schema.customRequests)
      .innerJoin(schema.vendors, eq(schema.vendors.id, schema.customRequests.vendorId))
      .where(and(eq(schema.customRequests.buyerId, u.id), isNull(schema.customRequests.hiddenAt)))
      .orderBy(desc(schema.customRequests.createdAt));
    return {
      requests: rows.map(({ r, vendorName, vendorSlug }) => ({
        id: r.id,
        vendor: { name: vendorName, slug: vendorSlug },
        projectType: r.projectType,
        brief: r.brief,
        quantityEstimate: r.quantityEstimate,
        status: r.status,
        vendorReply: r.vendorReply,
        quotedAmountKobo: r.quotedAmountKobo,
        quoteExpiresAt: r.quoteExpiresAt,
        createdAt: r.createdAt,
      })),
    };
  });
};
