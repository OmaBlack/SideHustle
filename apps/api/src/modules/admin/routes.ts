import { schema } from '@sidehustle/db';
import {
  CategoryInput,
  CommissionRuleInput,
  ConfigInput,
  DeliveryMethodInput,
  DispatchInput,
  HubCountInput,
  HubReceiveInput,
  HubThresholdInput,
  KitInput,
  RefundInput,
  RejectInput,
  RestrictionInput,
  RetentionInput,
  RuleInput,
} from '@sidehustle/schemas';
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { requireAdmin } from '../../lib/auth.js';
import { enqueue } from '../../lib/outbox.js';
import { badRequest, conflict, notFound } from '../../lib/problems.js';
import { dealView } from '../catalogue/service.js';
import { orderViews } from '../orders/view.js';
import { transitionFulfilment, type FulfilmentEvent } from '../orders/service.js';
import { refund } from '../payments/service.js';

const Id = z.object({ id: z.string().uuid() });
const Ref = z.object({ ref: z.string().max(20) });

/** Every handler here requires an admin and audits its change in the same transaction (FR-ADM-06). */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, payments } = app.deps;
  app.addHook('preHandler', async (req) => {
    requireAdmin(req);
  });
  const actor = (req: { auth: { user: { id: string } } | null }) => req.auth!.user.id;

  app.get('/admin/overview', { schema: { tags: ['admin'] } }, async () => {
    const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const n = sql<number>`count(*)`.mapWith(Number);
    const [pendingVendors, pendingDeals, openOrders, disputed, lowStock] = await Promise.all([
      count(db.select({ n }).from(schema.vendors).where(eq(schema.vendors.status, 'pending'))),
      count(
        db
          .select({ n })
          .from(schema.deals)
          .where(and(eq(schema.deals.moderationStatus, 'pending'), isNull(schema.deals.deletedAt))),
      ),
      count(
        db
          .select({ n })
          .from(schema.orders)
          .where(inArray(schema.orders.status, ['paid', 'in_fulfilment'])),
      ),
      count(db.select({ n }).from(schema.orders).where(eq(schema.orders.status, 'disputed'))),
      db
        .execute<{ n: number }>(
          sql`select count(*)::int as n from hub_stock_levels where available <= low_stock_threshold`,
        )
        .then((r) => Number(Array.from(r)[0]?.n ?? 0)),
    ]);
    return { pendingVendors, pendingDeals, openOrders, disputed, lowStock };
  });

  // Vendors (FR-ADM-01, BR-10).
  app.get(
    '/admin/vendors',
    {
      schema: {
        tags: ['admin'],
        querystring: z.object({ status: z.enum(['pending', 'verified', 'suspended']).optional() }),
      },
    },
    async (req) => {
      const rows = await db
        .select({ v: schema.vendors, category: schema.categories.name })
        .from(schema.vendors)
        .innerJoin(schema.categories, eq(schema.categories.id, schema.vendors.categoryId))
        .where(
          and(
            isNull(schema.vendors.deletedAt),
            req.query.status ? eq(schema.vendors.status, req.query.status) : undefined,
          ),
        )
        .orderBy(asc(schema.vendors.status), asc(schema.vendors.name));
      const ids = rows.map((r) => r.v.id);
      const licences = ids.length
        ? await db.select().from(schema.vendorLicences).where(inArray(schema.vendorLicences.vendorId, ids))
        : [];
      const staff = ids.length
        ? await db
            .select({
              vendorId: schema.vendorStaff.vendorId,
              name: schema.users.name,
              email: schema.users.email,
              phone: schema.users.phone,
              role: schema.vendorStaff.role,
            })
            .from(schema.vendorStaff)
            .innerJoin(schema.users, eq(schema.users.id, schema.vendorStaff.userId))
            .where(inArray(schema.vendorStaff.vendorId, ids))
        : [];
      return {
        vendors: rows.map(({ v, category }) => ({
          ...v,
          category,
          licences: licences.filter((l) => l.vendorId === v.id),
          staff: staff.filter((s) => s.vendorId === v.id),
        })),
      };
    },
  );

  const VENDOR_ACTIONS = {
    approve: { status: 'verified', kycStatus: 'approved' },
    reject: { kycStatus: 'rejected' },
    request_documents: { kycStatus: 'not_started' },
    suspend: { status: 'suspended' },
    reinstate: { status: 'verified' },
  } as const;

  app.post(
    '/admin/vendors/:id/:action',
    {
      schema: {
        tags: ['admin'],
        params: z.object({
          id: z.string().uuid(),
          action: z.enum(['approve', 'reject', 'request_documents', 'suspend', 'reinstate']),
        }),
        body: z.object({ note: z.string().max(500).optional() }).optional(),
      },
    },
    async (req) => {
      const change = VENDOR_ACTIONS[req.params.action];
      return db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schema.vendors)
          .where(eq(schema.vendors.id, req.params.id))
          .for('update');
        if (!before) throw notFound('Vendor not found');
        if (req.params.action === 'reinstate' && before.status !== 'suspended')
          throw conflict('NOT_SUSPENDED', 'This vendor is not suspended');
        const set: Partial<typeof schema.vendors.$inferInsert> = { ...change };
        if (req.params.action === 'approve') set.verifiedAt = new Date();
        const [after] = await tx
          .update(schema.vendors)
          .set(set)
          .where(eq(schema.vendors.id, before.id))
          .returning();
        await audit(tx, actor(req), `vendor.${req.params.action}`, 'vendor', before.id, {
          from: { status: before.status, kycStatus: before.kycStatus },
          to: change,
          note: req.body?.note,
        });
        if (req.params.action === 'approve')
          await enqueue(
            tx,
            'notify.vendor',
            { to: before.id, template: 'vendor_approved', data: {} },
            `vendor_approved:${before.id}`,
          );
        return { vendor: after };
      });
    },
  );

  app.post(
    '/admin/licences/:id/:action',
    {
      schema: {
        tags: ['admin'],
        params: z.object({ id: z.string().uuid(), action: z.enum(['approve', 'reject']) }),
      },
    },
    async (req) => {
      return db.transaction(async (tx) => {
        const status = req.params.action === 'approve' ? 'approved' : 'rejected';
        const [l] = await tx
          .update(schema.vendorLicences)
          .set({ status })
          .where(eq(schema.vendorLicences.id, req.params.id))
          .returning();
        if (!l) throw notFound('Licence not found');
        await audit(tx, actor(req), `licence.${req.params.action}`, 'vendor_licence', l.id, {
          vendorId: l.vendorId,
          licenceType: l.licenceType,
        });
        return { licence: l };
      });
    },
  );

  // Deals and requests moderation (FR-ADM-02).
  app.get(
    '/admin/deals',
    {
      schema: {
        tags: ['admin'],
        querystring: z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }),
      },
    },
    async (req) => {
      const rows = await db
        .select({ d: schema.deals, v: schema.vendors, c: schema.categories, p: schema.products })
        .from(schema.deals)
        .innerJoin(schema.vendors, eq(schema.vendors.id, schema.deals.vendorId))
        .innerJoin(schema.categories, eq(schema.categories.id, schema.deals.categoryId))
        .leftJoin(schema.products, eq(schema.products.id, schema.deals.productId))
        .where(
          and(
            isNull(schema.deals.deletedAt),
            req.query.status ? eq(schema.deals.moderationStatus, req.query.status) : undefined,
          ),
        )
        .orderBy(desc(schema.deals.createdAt))
        .limit(200);
      return { deals: rows.map(({ d, v, c, p }) => ({ ...dealView(d, v, c, p), createdAt: d.createdAt })) };
    },
  );

  app.post(
    '/admin/deals/:id/:action',
    {
      schema: {
        tags: ['admin'],
        params: z.object({ id: z.string().uuid(), action: z.enum(['approve', 'remove']) }),
        body: z.object({ reason: z.string().max(300).optional() }).optional(),
      },
    },
    async (req) =>
      db.transaction(async (tx) => {
        const set =
          req.params.action === 'approve'
            ? { moderationStatus: 'approved' as const }
            : { moderationStatus: 'rejected' as const, endedAt: new Date() };
        const [d] = await tx
          .update(schema.deals)
          .set(set)
          .where(eq(schema.deals.id, req.params.id))
          .returning();
        if (!d) throw notFound('Deal not found');
        await audit(tx, actor(req), `deal.${req.params.action}`, 'deal', d.id, {
          reason: req.body?.reason,
          headline: d.headline,
        });
        return { deal: d };
      }),
  );

  app.get('/admin/requests', { schema: { tags: ['admin'] } }, async () => {
    const rows = await db
      .select({ r: schema.customRequests, vendor: schema.vendors.name, buyer: schema.users.name })
      .from(schema.customRequests)
      .innerJoin(schema.vendors, eq(schema.vendors.id, schema.customRequests.vendorId))
      .innerJoin(schema.users, eq(schema.users.id, schema.customRequests.buyerId))
      .orderBy(desc(schema.customRequests.createdAt))
      .limit(200);
    return { requests: rows.map(({ r, vendor, buyer }) => ({ ...r, vendor, buyer })) };
  });

  app.post(
    '/admin/requests/:id/hide',
    { schema: { tags: ['admin'], params: Id, body: RejectInput } },
    async (req) =>
      db.transaction(async (tx) => {
        const [r] = await tx
          .update(schema.customRequests)
          .set({ hiddenAt: new Date(), hiddenReason: req.body.reason })
          .where(eq(schema.customRequests.id, req.params.id))
          .returning();
        if (!r) throw notFound('Request not found');
        await audit(tx, actor(req), 'request.hide', 'custom_request', r.id, { reason: req.body.reason });
        return { request: r };
      }),
  );

  // Orders, refunds, disputes, hub fulfilments (FR-ADM-03).
  app.get(
    '/admin/orders',
    {
      schema: {
        tags: ['admin'],
        querystring: z.object({ status: z.string().max(30).optional(), q: z.string().max(40).optional() }),
      },
    },
    async (req) => {
      const conds: (SQL | undefined)[] = [];
      if (req.query.status) conds.push(eq(schema.orders.status, req.query.status as never));
      if (req.query.q)
        conds.push(
          or(
            ilike(schema.orders.ref, `%${req.query.q}%`),
            ilike(schema.orders.recipient, `%${req.query.q}%`),
          ),
        );
      const rows = await db
        .select()
        .from(schema.orders)
        .where(and(...conds))
        .orderBy(desc(schema.orders.createdAt))
        .limit(100);
      return { orders: await orderViews(db, rows) };
    },
  );

  app.get('/admin/orders/:ref', { schema: { tags: ['admin'], params: Ref } }, async (req) => {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.ref, req.params.ref));
    if (!o) throw notFound('Order not found');
    const [view] = await orderViews(db, [o]);
    const [buyer] = await db
      .select({ name: schema.users.name, email: schema.users.email, phone: schema.users.phone })
      .from(schema.users)
      .where(eq(schema.users.id, o.buyerId));
    const pay = await db.select().from(schema.payments).where(eq(schema.payments.orderId, o.id));
    const refunds = pay.length
      ? await db
          .select()
          .from(schema.refunds)
          .where(
            inArray(
              schema.refunds.paymentId,
              pay.map((p) => p.id),
            ),
          )
      : [];
    const refundedKobo = refunds.filter((r) => r.status !== 'failed').reduce((s, r) => s + r.amountKobo, 0);
    return {
      order: view,
      buyer,
      refunds,
      refundedKobo,
      refundableKobo: Math.max(0, (pay.find((p) => p.status === 'success')?.amountKobo ?? 0) - refundedKobo),
    };
  });

  app.post(
    '/admin/orders/:ref/refunds',
    { schema: { tags: ['admin'], params: Ref, body: RefundInput } },
    async (req, reply) => {
      const [o] = await db.select().from(schema.orders).where(eq(schema.orders.ref, req.params.ref));
      if (!o) throw notFound('Order not found');
      const r = await db.transaction(async (tx) => {
        if (req.body.fulfilmentId) {
          const [f] = await tx
            .select()
            .from(schema.fulfilments)
            .where(
              and(eq(schema.fulfilments.id, req.body.fulfilmentId), eq(schema.fulfilments.orderId, o.id)),
            );
          if (!f) throw badRequest('BAD_FULFILMENT', 'That fulfilment is not part of this order');
        }
        const row = await refund(tx, payments, o.id, req.body.amountKobo, req.body.reason, {
          fulfilmentId: req.body.fulfilmentId,
          actorId: actor(req),
        });
        await audit(tx, actor(req), 'order.refund', 'order', o.id, {
          amountKobo: req.body.amountKobo,
          fulfilmentId: req.body.fulfilmentId,
          reason: req.body.reason,
        });
        return row;
      });
      return reply.status(201).send({ refund: r });
    },
  );

  app.post(
    '/admin/orders/:ref/dispute/:outcome',
    {
      schema: {
        tags: ['admin'],
        params: z.object({ ref: z.string().max(20), outcome: z.enum(['open', 'complete', 'refund']) }),
        body: RejectInput,
      },
    },
    async (req) => {
      const [o] = await db.select().from(schema.orders).where(eq(schema.orders.ref, req.params.ref));
      if (!o) throw notFound('Order not found');
      return db.transaction(async (tx) => {
        const { outcome } = req.params;
        if (outcome === 'open' && o.status !== 'delivered')
          throw conflict('BAD_TRANSITION', 'Only delivered orders can be disputed');
        if (outcome !== 'open' && o.status !== 'disputed')
          throw conflict('BAD_TRANSITION', 'This order is not in dispute');
        if (outcome === 'refund') {
          const [p] = await tx
            .select()
            .from(schema.payments)
            .where(and(eq(schema.payments.orderId, o.id), eq(schema.payments.status, 'success')));
          const [done] = await tx
            .select({ s: sql<number>`coalesce(sum(${schema.refunds.amountKobo}),0)`.mapWith(Number) })
            .from(schema.refunds)
            .where(eq(schema.refunds.paymentId, p!.id));
          const left = p!.amountKobo - done!.s;
          if (left > 0)
            await refund(tx, payments, o.id, left, `Dispute: ${req.body.reason}`, { actorId: actor(req) });
        }
        const status = outcome === 'open' ? 'disputed' : outcome === 'complete' ? 'completed' : 'refunded';
        await tx.update(schema.orders).set({ status }).where(eq(schema.orders.id, o.id));
        await audit(tx, actor(req), `order.dispute.${outcome}`, 'order', o.id, { reason: req.body.reason });
        return { status };
      });
    },
  );

  const hubAction =
    (event: FulfilmentEvent) =>
    async (req: { params: { id: string }; body?: unknown; auth: { user: { id: string } } | null }) => {
      const [f] = await db.select().from(schema.fulfilments).where(eq(schema.fulfilments.id, req.params.id));
      if (!f) throw notFound('Fulfilment not found');
      const body = (req.body ?? {}) as { reason?: string; trackingRef?: string };
      return db.transaction(async (tx) => {
        const result = await transitionFulfilment(tx, f.id, event, {
          ...body,
          refund: async (orderId, amountKobo) => {
            await refund(tx, payments, orderId, amountKobo, `Rejected: ${body.reason ?? ''}`.trim(), {
              fulfilmentId: f.id,
              actorId: actor(req),
            });
          },
        });
        await audit(tx, actor(req), `fulfilment.${event}`, 'fulfilment', f.id, body);
        return { fulfilment: result };
      });
    };
  // Admins run hub fulfilments and can act on vendor ones when a vendor cannot (support cases).
  app.post(
    '/admin/fulfilments/:id/confirm',
    { schema: { tags: ['admin'], params: Id } },
    hubAction('confirm'),
  );
  app.post(
    '/admin/fulfilments/:id/reject',
    { schema: { tags: ['admin'], params: Id, body: RejectInput } },
    hubAction('reject'),
  );
  app.post(
    '/admin/fulfilments/:id/dispatch',
    { schema: { tags: ['admin'], params: Id, body: DispatchInput } },
    hubAction('dispatch'),
  );
  app.post(
    '/admin/fulfilments/:id/deliver',
    { schema: { tags: ['admin'], params: Id } },
    hubAction('deliver'),
  );

  // Configuration (FR-ADM-04/09/10/11, NFR-MNT-02). Small generic CRUD with audit.
  type Table =
    | typeof schema.bundleRules
    | typeof schema.commissionRules
    | typeof schema.deliveryMethods
    | typeof schema.retentionPolicies
    | typeof schema.restrictedItems
    | typeof schema.categories;
  const crud = <B extends z.ZodTypeAny>(
    path: string,
    table: Table,
    body: B,
    entity: string,
    order: SQL | undefined = undefined,
  ) => {
    app.get(`/admin/${path}`, { schema: { tags: ['admin'] } }, async () => ({
      items: await db
        .select()
        .from(table as never)
        .orderBy(order ?? sql`1`),
    }));
    app.post(`/admin/${path}`, { schema: { tags: ['admin'], body } }, async (req, reply) =>
      db.transaction(async (tx) => {
        const [row] = (await tx
          .insert(table as typeof schema.bundleRules)
          .values(req.body as never)
          .returning()) as { id?: string; key?: string }[];
        await audit(tx, actor(req), `${entity}.create`, entity, String(row!.id), req.body);
        return reply.status(201).send({ item: row });
      }),
    );
    app.put(`/admin/${path}/:id`, { schema: { tags: ['admin'], params: Id, body } }, async (req) =>
      db.transaction(async (tx) => {
        const t = table as typeof schema.bundleRules;
        const [before] = await tx.select().from(t).where(eq(t.id, req.params.id));
        if (!before) throw notFound();
        const [row] = await tx
          .update(t)
          .set(req.body as never)
          .where(eq(t.id, req.params.id))
          .returning();
        await audit(tx, actor(req), `${entity}.update`, entity, req.params.id, {
          from: before,
          to: req.body,
        });
        return { item: row };
      }),
    );
    app.delete(`/admin/${path}/:id`, { schema: { tags: ['admin'], params: Id } }, async (req, reply) =>
      db.transaction(async (tx) => {
        const t = table as typeof schema.bundleRules;
        const [before] = await tx.delete(t).where(eq(t.id, req.params.id)).returning();
        if (!before) throw notFound();
        await audit(tx, actor(req), `${entity}.delete`, entity, req.params.id, { from: before });
        return reply.status(204).send();
      }),
    );
  };
  crud('bundle-rules', schema.bundleRules, RuleInput, 'bundle_rule', asc(schema.bundleRules.scope));
  crud(
    'commission-rules',
    schema.commissionRules,
    CommissionRuleInput,
    'commission_rule',
    asc(schema.commissionRules.scope),
  );
  crud(
    'delivery-methods',
    schema.deliveryMethods,
    DeliveryMethodInput,
    'delivery_method',
    asc(schema.deliveryMethods.sortOrder),
  );
  crud(
    'retention',
    schema.retentionPolicies,
    RetentionInput,
    'retention_policy',
    asc(schema.retentionPolicies.dataType),
  );
  crud('restrictions', schema.restrictedItems, RestrictionInput, 'restricted_item');
  crud('categories', schema.categories, CategoryInput, 'category', asc(schema.categories.sortOrder));

  app.get('/admin/config', { schema: { tags: ['admin'] } }, async () => ({
    config: await db.select().from(schema.appConfig).orderBy(asc(schema.appConfig.key)),
    payout: await db.select().from(schema.payoutSettings),
  }));
  app.put(
    '/admin/config/:key',
    {
      schema: {
        tags: ['admin'],
        params: z.object({ key: z.string().regex(/^[a-z_]{2,40}$/) }),
        body: ConfigInput,
      },
    },
    async (req) =>
      db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(schema.appConfig)
          .where(eq(schema.appConfig.key, req.params.key));
        const [row] = await tx
          .insert(schema.appConfig)
          .values({ key: req.params.key, value: req.body.value as never, updatedBy: actor(req) })
          .onConflictDoUpdate({
            target: schema.appConfig.key,
            set: { value: req.body.value as never, updatedBy: actor(req) },
          })
          .returning();
        await audit(tx, actor(req), 'config.update', 'app_config', req.params.key, {
          from: before?.value,
          to: req.body.value,
        });
        return { item: row };
      }),
  );
  app.put(
    '/admin/payout-settings/:id',
    {
      schema: {
        tags: ['admin'],
        params: Id,
        body: z.object({
          daysAfterDelivery: z.number().int().min(0).max(90),
          holdbackBps: z.number().int().min(0).max(10_000),
        }),
      },
    },
    async (req) =>
      db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.payoutSettings)
          .set(req.body)
          .where(eq(schema.payoutSettings.id, req.params.id))
          .returning();
        if (!row) throw notFound();
        await audit(tx, actor(req), 'payout_settings.update', 'payout_settings', row.id, req.body);
        return { item: row };
      }),
  );

  // Starter kits (FR-ADM-05).
  app.get('/admin/kits', { schema: { tags: ['admin'] } }, async () => {
    const kits = await db
      .select()
      .from(schema.kits)
      .where(isNull(schema.kits.deletedAt))
      .orderBy(asc(schema.kits.sortOrder));
    const items = await db.select().from(schema.kitItems).orderBy(asc(schema.kitItems.sort));
    const extras = await db.select().from(schema.kitExtras).orderBy(asc(schema.kitExtras.sort));
    return {
      kits: kits.map((k) => ({
        ...k,
        items: items.filter((i) => i.kitId === k.id).map((i) => ({ productId: i.productId, qty: i.qty })),
        extras: extras.filter((e) => e.kitId === k.id).map((e) => e.label),
      })),
    };
  });
  const writeKit = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    kitId: string,
    b: z.infer<typeof KitInput>,
  ) => {
    await tx.delete(schema.kitItems).where(eq(schema.kitItems.kitId, kitId));
    await tx.delete(schema.kitExtras).where(eq(schema.kitExtras.kitId, kitId));
    await tx
      .insert(schema.kitItems)
      .values(b.items.map((i, sort) => ({ kitId, productId: i.productId, qty: i.qty, sort })));
    if (b.extras.length)
      await tx.insert(schema.kitExtras).values(b.extras.map((label, sort) => ({ kitId, label, sort })));
  };
  const kitValues = (b: z.infer<typeof KitInput>) => ({
    name: b.name,
    categoryId: b.categoryId,
    priceKobo: b.priceKobo,
    tip: b.tip || null,
    status: (b.active ? 'active' : 'archived') as 'active' | 'archived',
    platformFunded: b.platformFunded,
    sortOrder: b.sortOrder,
  });
  app.post('/admin/kits', { schema: { tags: ['admin'], body: KitInput } }, async (req, reply) =>
    db.transaction(async (tx) => {
      const base = req.body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      const [k] = await tx
        .insert(schema.kits)
        .values({ ...kitValues(req.body), slug: `${base}-${Date.now().toString(36)}` })
        .returning();
      await writeKit(tx, k!.id, req.body);
      await audit(tx, actor(req), 'kit.create', 'kit', k!.id, req.body);
      return reply.status(201).send({ kit: k });
    }),
  );
  app.put('/admin/kits/:id', { schema: { tags: ['admin'], params: Id, body: KitInput } }, async (req) =>
    db.transaction(async (tx) => {
      const [k] = await tx
        .update(schema.kits)
        .set(kitValues(req.body))
        .where(eq(schema.kits.id, req.params.id))
        .returning();
      if (!k) throw notFound('Kit not found');
      await writeKit(tx, k.id, req.body);
      await audit(tx, actor(req), 'kit.update', 'kit', k.id, req.body);
      return { kit: k };
    }),
  );

  // Hub inventory (FR-ADM-07).
  app.get('/admin/hub-stock', { schema: { tags: ['admin'] } }, async () => {
    const rows = await db.execute<{
      product_id: string;
      name: string;
      vendor: string;
      fulfilment_mode: string;
      on_hand: number | null;
      available: number | null;
      low_stock_threshold: number | null;
    }>(sql`
      select p.id as product_id, p.name, v.name as vendor, p.fulfilment_mode, l.on_hand, l.available, l.low_stock_threshold
      from products p join vendors v on v.id = p.vendor_id left join hub_stock_levels l on l.product_id = p.id
      where p.deleted_at is null
      order by (p.fulfilment_mode = 'hub') desc, p.name`);
    return {
      items: Array.from(rows, (r) => ({
        productId: r.product_id,
        name: r.name,
        vendor: r.vendor,
        mode: r.fulfilment_mode,
        onHand: Number(r.on_hand ?? 0),
        available: Number(r.available ?? 0),
        lowStockThreshold: Number(r.low_stock_threshold ?? 0),
        low: r.fulfilment_mode === 'hub' && Number(r.available ?? 0) <= Number(r.low_stock_threshold ?? 0),
      })),
    };
  });
  const ensureHub = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], productId: string) => {
    const [p] = await tx.select().from(schema.products).where(eq(schema.products.id, productId));
    if (!p) throw notFound('Product not found');
    await tx.insert(schema.hubStock).values({ productId }).onConflictDoNothing();
    await tx.select().from(schema.hubStock).where(eq(schema.hubStock.productId, productId)).for('update');
    return p;
  };
  app.post('/admin/hub-stock/receive', { schema: { tags: ['admin'], body: HubReceiveInput } }, async (req) =>
    db.transaction(async (tx) => {
      await ensureHub(tx, req.body.productId);
      await tx.insert(schema.hubStockMovements).values({
        productId: req.body.productId,
        kind: 'receipt',
        qty: req.body.qty,
        actorId: actor(req),
        reason: req.body.reason || 'Received from vendor',
      });
      await audit(tx, actor(req), 'hub.receive', 'product', req.body.productId, req.body);
      return { ok: true };
    }),
  );
  app.post('/admin/hub-stock/count', { schema: { tags: ['admin'], body: HubCountInput } }, async (req) =>
    db.transaction(async (tx) => {
      await ensureHub(tx, req.body.productId);
      const [lvl] = Array.from(
        await tx.execute<{ on_hand: number }>(
          sql`select on_hand from hub_stock_levels where product_id = ${req.body.productId}`,
        ),
      );
      const delta = req.body.counted - Number(lvl?.on_hand ?? 0);
      if (delta !== 0) {
        await tx.insert(schema.hubStockMovements).values({
          productId: req.body.productId,
          kind: 'adjustment',
          qty: delta,
          actorId: actor(req),
          reason: req.body.reason,
        });
      }
      await audit(tx, actor(req), 'hub.count', 'product', req.body.productId, { ...req.body, delta });
      return { delta };
    }),
  );
  app.put(
    '/admin/hub-stock/threshold',
    { schema: { tags: ['admin'], body: HubThresholdInput } },
    async (req) =>
      db.transaction(async (tx) => {
        await ensureHub(tx, req.body.productId);
        await tx
          .update(schema.hubStock)
          .set({ lowStockThreshold: req.body.lowStockThreshold })
          .where(eq(schema.hubStock.productId, req.body.productId));
        await audit(tx, actor(req), 'hub.threshold', 'product', req.body.productId, req.body);
        return { ok: true };
      }),
  );
  app.put(
    '/admin/products/:id/fulfilment-mode',
    { schema: { tags: ['admin'], params: Id, body: z.object({ mode: z.enum(['drop_ship', 'hub']) }) } },
    async (req) =>
      db.transaction(async (tx) => {
        const [p] = await tx
          .update(schema.products)
          .set({ fulfilmentMode: req.body.mode })
          .where(eq(schema.products.id, req.params.id))
          .returning();
        if (!p) throw notFound('Product not found');
        if (req.body.mode === 'hub')
          await tx.insert(schema.hubStock).values({ productId: p.id }).onConflictDoNothing();
        await audit(tx, actor(req), 'product.fulfilment_mode', 'product', p.id, req.body);
        return { product: p };
      }),
  );

  // Audit log viewer (FR-ADM-06), newest first, cursor by timestamp.
  app.get(
    '/admin/audit-log',
    {
      schema: {
        tags: ['admin'],
        querystring: z.object({
          entity: z.string().max(40).optional(),
          before: z.string().datetime().optional(),
        }),
      },
    },
    async (req) => {
      const rows = await db
        .select({ a: schema.auditLog, actor: schema.users.name })
        .from(schema.auditLog)
        .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
        .where(
          and(
            req.query.entity ? eq(schema.auditLog.entity, req.query.entity) : undefined,
            req.query.before ? lt(schema.auditLog.at, new Date(req.query.before)) : undefined,
          ),
        )
        .orderBy(desc(schema.auditLog.at))
        .limit(100);
      return {
        entries: rows.map(({ a, actor }) => ({ ...a, actorName: actor })),
        next: rows.length === 100 ? rows.at(-1)!.a.at : null,
      };
    },
  );

  // Products picker for kit and restriction editors.
  app.get('/admin/products', { schema: { tags: ['admin'] } }, async () => ({
    products: await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        vendor: schema.vendors.name,
        status: schema.products.status,
        costKobo: schema.products.costKobo,
        rrpKobo: schema.products.rrpKobo,
      })
      .from(schema.products)
      .innerJoin(schema.vendors, eq(schema.vendors.id, schema.products.vendorId))
      .where(isNull(schema.products.deletedAt))
      .orderBy(asc(schema.products.name)),
  }));
};
