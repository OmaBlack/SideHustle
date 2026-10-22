import { schema } from '@sidehustle/db';
import { ProfileInput, SavedBundleInput } from '@sidehustle/schemas';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireUser } from '../../lib/auth.js';
import { loadPricingContext, type StoredBundleItem } from '../../lib/pricing.js';
import { notFound } from '../../lib/problems.js';
import { bundleView } from '../catalogue/service.js';
import { loadMe } from '../identity/service.js';

const PAID = ['paid', 'in_fulfilment', 'delivered', 'completed', 'disputed'] as const;

export const accountRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;

  // FR-ACC-07: profile, interests, number of orders and total stock bought.
  app.get('/me/account', { schema: { tags: ['account'] } }, async (req) => {
    const u = requireUser(req);
    const [stats] = await db
      .select({
        orders: sql<number>`count(distinct ${schema.orders.id})`.mapWith(Number),
        units:
          sql<number>`coalesce(sum(${schema.orderLines.qty}) filter (where ${isNotNull(schema.orderLines.fulfilmentId)}), 0)`.mapWith(
            Number,
          ),
        spentKobo:
          sql<number>`coalesce(sum(${schema.orderLines.unitPriceKobo} * ${schema.orderLines.qty} - ${schema.orderLines.discountKobo}) filter (where ${isNotNull(schema.orderLines.fulfilmentId)}), 0)`.mapWith(
            Number,
          ),
      })
      .from(schema.orders)
      .leftJoin(schema.orderLines, eq(schema.orderLines.orderId, schema.orders.id))
      .where(and(eq(schema.orders.buyerId, u.id), inArray(schema.orders.status, [...PAID])));
    const consents = await db.select().from(schema.consents).where(eq(schema.consents.userId, u.id));
    const requests = await db
      .select()
      .from(schema.dataRequests)
      .where(eq(schema.dataRequests.userId, u.id))
      .orderBy(desc(schema.dataRequests.createdAt));
    return {
      user: await loadMe(db, u.id),
      stats: {
        orderCount: stats?.orders ?? 0,
        unitsBought: stats?.units ?? 0,
        stockValueKobo: stats?.spentKobo ?? 0,
      },
      consents: consents.map((c) => ({
        purpose: c.purpose,
        grantedAt: c.grantedAt,
        withdrawnAt: c.withdrawnAt,
      })),
      dataRequests: requests.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  });

  app.put('/me/profile', { schema: { tags: ['account'], body: ProfileInput } }, async (req) => {
    const u = requireUser(req);
    await db
      .update(schema.users)
      .set({
        name: req.body.name,
        businessName: req.body.businessName || null,
        state: req.body.state,
        interests: req.body.interests,
      })
      .where(eq(schema.users.id, u.id));
    return { user: await loadMe(db, u.id) };
  });

  app.put(
    '/me/consents/marketing',
    { schema: { tags: ['account'], body: z.object({ granted: z.boolean() }) } },
    async (req) => {
      const u = requireUser(req);
      if (req.body.granted) {
        await db
          .insert(schema.consents)
          .values({ userId: u.id, purpose: 'marketing', policyVersion: '2026-10' });
      } else {
        await db
          .update(schema.consents)
          .set({ withdrawnAt: new Date() })
          .where(and(eq(schema.consents.userId, u.id), eq(schema.consents.purpose, 'marketing')));
      }
      return { ok: true };
    },
  );

  // FR-ACC-08: export and deletion are queued; the jobs that fulfil them are ticket 3.11.
  app.post(
    '/me/data-requests',
    { schema: { tags: ['account'], body: z.object({ kind: z.enum(['export', 'delete']) }) } },
    async (req, reply) => {
      const u = requireUser(req);
      const [open] = await db
        .select()
        .from(schema.dataRequests)
        .where(
          and(
            eq(schema.dataRequests.userId, u.id),
            eq(schema.dataRequests.kind, req.body.kind),
            inArray(schema.dataRequests.status, ['pending', 'processing']),
          ),
        );
      if (open) return reply.status(200).send({ request: open });
      const [row] = await db
        .insert(schema.dataRequests)
        .values({ userId: u.id, kind: req.body.kind })
        .returning();
      return reply.status(201).send({ request: row });
    },
  );

  // FR-BLD-05: saved kits store product ids and quantities and are re-priced on load.
  app.get('/me/bundles', { schema: { tags: ['builder'] } }, async (req) => {
    const u = requireUser(req);
    const rows = await db
      .select()
      .from(schema.savedBundles)
      .where(eq(schema.savedBundles.userId, u.id))
      .orderBy(desc(schema.savedBundles.updatedAt));
    const ctx = await loadPricingContext(db);
    return {
      bundles: rows.map((b) => {
        const items = (b.items as StoredBundleItem[]).filter((i) => ctx.catalogue.products.has(i.productId));
        let quote = null;
        try {
          quote = items.length ? bundleView(items, ctx) : null;
        } catch {
          quote = null;
        }
        return {
          id: b.id,
          name: b.name,
          items,
          droppedItems: (b.items as unknown[]).length - items.length,
          quote,
          updatedAt: b.updatedAt,
        };
      }),
    };
  });

  app.post('/me/bundles', { schema: { tags: ['builder'], body: SavedBundleInput } }, async (req, reply) => {
    const u = requireUser(req);
    const [row] = await db
      .insert(schema.savedBundles)
      .values({ userId: u.id, name: req.body.name, items: req.body.items })
      .returning();
    return reply.status(201).send({ bundle: row });
  });

  app.put(
    '/me/bundles/:id',
    { schema: { tags: ['builder'], params: z.object({ id: z.string().uuid() }), body: SavedBundleInput } },
    async (req) => {
      const u = requireUser(req);
      const [row] = await db
        .update(schema.savedBundles)
        .set({ name: req.body.name, items: req.body.items })
        .where(and(eq(schema.savedBundles.id, req.params.id), eq(schema.savedBundles.userId, u.id)))
        .returning();
      if (!row) throw notFound('Saved kit not found');
      return { bundle: row };
    },
  );

  app.delete(
    '/me/bundles/:id',
    { schema: { tags: ['builder'], params: z.object({ id: z.string().uuid() }) } },
    async (req, reply) => {
      const u = requireUser(req);
      const res = await db
        .delete(schema.savedBundles)
        .where(and(eq(schema.savedBundles.id, req.params.id), eq(schema.savedBundles.userId, u.id)))
        .returning({ id: schema.savedBundles.id });
      if (!res.length) throw notFound('Saved kit not found');
      return reply.status(204).send();
    },
  );
};
