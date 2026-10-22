import { schema } from '@sidehustle/db';
import {
  DealInput,
  DispatchInput,
  LicenceInput,
  ProductInput,
  RejectInput,
  RequestQuoteInput,
  RequestReplyInput,
  VendorApplicationInput,
} from '@sidehustle/schemas';
import { and, asc, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireUser, requireVendor } from '../../lib/auth.js';
import type { Tx } from '../../lib/db.js';
import { moderationFlags } from '../../lib/moderation.js';
import { enqueue } from '../../lib/outbox.js';
import { loadPricingContext } from '../../lib/pricing.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/problems.js';
import { daysFromNow } from '../../lib/time.js';
import { appConfigValue, dealView, productView } from '../catalogue/service.js';
import { orderViews } from '../orders/view.js';
import { transitionFulfilment, type FulfilmentEvent } from '../orders/service.js';
import { refund } from '../payments/service.js';

const Id = z.object({ id: z.string().uuid() });

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'item';

async function uniqueSlug(tx: Tx, table: typeof schema.products | typeof schema.vendors, base: string) {
  const rows = await tx.select({ slug: table.slug }).from(table);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** NFR-PRV-03: the licence a vendor needs to list this product, if it is missing; null when it may be listed. */
export async function missingLicence(tx: Tx, vendorId: string, productId: string | null, categoryId: string) {
  const rules = await tx
    .select()
    .from(schema.restrictedItems)
    .where(
      or(
        eq(schema.restrictedItems.categoryId, categoryId),
        productId ? eq(schema.restrictedItems.productId, productId) : undefined,
      ),
    );
  if (!rules.length) return null;
  const held = await tx
    .select()
    .from(schema.vendorLicences)
    .where(
      and(
        eq(schema.vendorLicences.vendorId, vendorId),
        eq(schema.vendorLicences.status, 'approved'),
        or(isNull(schema.vendorLicences.expiresAt), gt(schema.vendorLicences.expiresAt, new Date())),
      ),
    );
  const have = new Set(held.map((l) => l.licenceType));
  return rules.find((r) => !have.has(r.requiredLicence))?.requiredLicence ?? null;
}

export const vendorRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, payments } = app.deps;
  const vendorOf = (req: Parameters<typeof requireVendor>[1]) => requireVendor(app, req);

  // FR-ADM-01 / ticket 3.1: anyone signed in can apply; the vendor starts pending until an admin approves.
  app.post(
    '/vendor/apply',
    { schema: { tags: ['vendor'], body: VendorApplicationInput } },
    async (req, reply) => {
      const u = requireUser(req);
      const [existing] = await db
        .select()
        .from(schema.vendorStaff)
        .where(eq(schema.vendorStaff.userId, u.id));
      if (existing) throw conflict('ALREADY_VENDOR', 'You already belong to a vendor');
      const vendor = await db.transaction(async (tx) => {
        const slug = await uniqueSlug(tx, schema.vendors, slugify(req.body.name));
        const [v] = await tx
          .insert(schema.vendors)
          .values({
            slug,
            name: req.body.name,
            categoryId: req.body.categoryId,
            location: req.body.location,
            about: req.body.about || null,
            acceptsCustom: req.body.acceptsCustom,
            leadTimeText: req.body.leadTimeText || null,
            shipsTo: req.body.shipsTo || null,
            status: 'pending',
            kycStatus: 'submitted',
          })
          .returning();
        await tx.insert(schema.vendorStaff).values({ vendorId: v!.id, userId: u.id, role: 'owner' });
        if (u.role === 'buyer')
          await tx.update(schema.users).set({ role: 'vendor_staff' }).where(eq(schema.users.id, u.id));
        return v!;
      });
      return reply.status(201).send({ vendor });
    },
  );

  app.get('/vendor/me', { schema: { tags: ['vendor'] } }, async (req) => {
    const { vendor, staffRole } = await vendorOf(req);
    const awaiting = await db
      .select({ id: schema.fulfilments.id })
      .from(schema.fulfilments)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.fulfilments.orderId))
      .where(
        and(
          eq(schema.fulfilments.vendorId, vendor.id),
          eq(schema.fulfilments.status, 'awaiting_confirmation'),
          inArray(schema.orders.status, ['paid', 'in_fulfilment']),
        ),
      );
    const newRequests = await db
      .select({ id: schema.customRequests.id })
      .from(schema.customRequests)
      .where(and(eq(schema.customRequests.vendorId, vendor.id), eq(schema.customRequests.status, 'new')));
    return {
      vendor,
      staffRole,
      counts: { awaitingConfirmation: awaiting.length, newRequests: newRequests.length },
    };
  });

  // Products (FR-VP-02). Tenancy: every query is scoped to the session's vendor.
  app.get('/vendor/products', { schema: { tags: ['vendor'] } }, async (req) => {
    const { vendor } = await vendorOf(req);
    const rows = await db
      .select({ p: schema.products, c: schema.categories })
      .from(schema.products)
      .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
      .where(and(eq(schema.products.vendorId, vendor.id), isNull(schema.products.deletedAt)))
      .orderBy(asc(schema.products.name));
    const ctx = await loadPricingContext(db);
    return {
      products: rows.map(({ p, c }) => ({
        ...productView(p, vendor, c, ctx),
        status: p.status,
        costKobo: p.costKobo,
        stockQty: p.stockQty,
        options: p.options,
        note: p.note,
        leadTimeText: p.leadTimeText,
      })),
    };
  });

  const writeProduct = async (
    tx: Tx,
    vendorId: string,
    body: z.infer<typeof ProductInput>,
    productId: string | null,
  ) => {
    const licence = await missingLicence(tx, vendorId, productId, body.categoryId);
    // Listings that fail the restriction check are held as drafts until a licence is approved.
    const status = !body.active ? 'archived' : licence ? 'draft' : 'active';
    const values = {
      name: body.name,
      categoryId: body.categoryId,
      unit: body.unit,
      costKobo: body.costKobo,
      rrpKobo: body.rrpKobo,
      moq: body.moq,
      leadTimeText: body.leadTimeText || null,
      note: body.note || null,
      stockQty: body.stockQty,
      options: body.options,
      status: status as 'draft' | 'active' | 'archived',
      searchText: body.name,
    };
    return { values, heldFor: licence };
  };

  app.post('/vendor/products', { schema: { tags: ['vendor'], body: ProductInput } }, async (req, reply) => {
    const { vendorId } = await vendorOf(req);
    const out = await db.transaction(async (tx) => {
      const { values, heldFor } = await writeProduct(tx, vendorId, req.body, null);
      const slug = await uniqueSlug(tx, schema.products, slugify(req.body.name));
      const [p] = await tx
        .insert(schema.products)
        .values({ ...values, slug, vendorId })
        .returning();
      return { product: p!, heldFor };
    });
    return reply.status(201).send(out);
  });

  app.put(
    '/vendor/products/:id',
    { schema: { tags: ['vendor'], params: Id, body: ProductInput } },
    async (req) => {
      const { vendorId } = await vendorOf(req);
      return db.transaction(async (tx) => {
        const [own] = await tx
          .select()
          .from(schema.products)
          .where(
            and(
              eq(schema.products.id, req.params.id),
              eq(schema.products.vendorId, vendorId),
              isNull(schema.products.deletedAt),
            ),
          );
        if (!own) throw notFound('Product not found');
        const { values, heldFor } = await writeProduct(tx, vendorId, req.body, own.id);
        // Hub-held stock is counted by admins, so a vendor cannot overwrite it.
        if (own.fulfilmentMode === 'hub') values.stockQty = own.stockQty;
        const [p] = await tx
          .update(schema.products)
          .set(values)
          .where(eq(schema.products.id, own.id))
          .returning();
        return { product: p!, heldFor };
      });
    },
  );

  app.delete('/vendor/products/:id', { schema: { tags: ['vendor'], params: Id } }, async (req, reply) => {
    const { vendorId } = await vendorOf(req);
    const res = await db
      .update(schema.products)
      .set({ status: 'archived' })
      .where(and(eq(schema.products.id, req.params.id), eq(schema.products.vendorId, vendorId)))
      .returning({ id: schema.products.id });
    if (!res.length) throw notFound('Product not found');
    return reply.status(204).send();
  });

  // Deals (FR-VP-03..06).
  app.get('/vendor/deals', { schema: { tags: ['vendor'] } }, async (req) => {
    const { vendor } = await vendorOf(req);
    const rows = await db
      .select({ d: schema.deals, c: schema.categories, p: schema.products })
      .from(schema.deals)
      .innerJoin(schema.categories, eq(schema.categories.id, schema.deals.categoryId))
      .leftJoin(schema.products, eq(schema.products.id, schema.deals.productId))
      .where(and(eq(schema.deals.vendorId, vendor.id), isNull(schema.deals.deletedAt)))
      .orderBy(desc(schema.deals.createdAt));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
    return {
      deals: rows.map(({ d, c, p }) => ({
        ...dealView(d, vendor, c, p),
        state:
          d.endedAt || (d.endsOn && d.endsOn < today)
            ? 'ended'
            : d.moderationStatus === 'approved'
              ? 'live'
              : d.moderationStatus === 'rejected'
                ? 'removed'
                : 'in_review',
      })),
    };
  });

  app.post('/vendor/deals', { schema: { tags: ['vendor'], body: DealInput } }, async (req, reply) => {
    const { vendor } = await vendorOf(req);
    const b = req.body;
    const maxPct = await appConfigValue(db, 'promo_max_pct', 90);
    if (b.kind === 'promo' && b.discountPct > maxPct)
      throw badRequest('DISCOUNT_TOO_HIGH', `Promos can be at most ${maxPct}% off`);
    let categoryId = b.categoryId ?? vendor.categoryId;
    let productId: string | null = null;
    if (b.kind === 'promo' && b.scope === 'product') {
      const [p] = await db
        .select()
        .from(schema.products)
        .where(and(eq(schema.products.id, b.productId!), eq(schema.products.vendorId, vendor.id)));
      // Rule 1: a vendor can never change the price of another vendor's product.
      if (!p) throw forbidden('You can only discount your own products');
      productId = p.id;
      categoryId = p.categoryId;
    }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
    if (b.endsOn && b.endsOn < today) throw badRequest('END_IN_PAST', 'The end date has already passed');
    const flags = moderationFlags(b.headline, b.detail);
    const [d] = await db
      .insert(schema.deals)
      .values({
        vendorId: vendor.id,
        kind: b.kind,
        scope: b.kind === 'launch' ? 'category' : b.scope,
        categoryId,
        productId: b.kind === 'launch' ? null : productId,
        discountPct: b.kind === 'launch' ? 0 : b.discountPct,
        headline: b.headline,
        detail: b.detail || null,
        endsOn: b.endsOn ?? null,
        moderationStatus: vendor.status === 'verified' && !flags.length ? 'approved' : 'pending',
      })
      .returning();
    return reply.status(201).send({ deal: d, heldFor: flags });
  });

  // FR-VP-05: vendors can remove a deal at any time.
  app.delete('/vendor/deals/:id', { schema: { tags: ['vendor'], params: Id } }, async (req, reply) => {
    const { vendorId } = await vendorOf(req);
    const res = await db
      .update(schema.deals)
      .set({ endedAt: new Date(), deletedAt: new Date() })
      .where(and(eq(schema.deals.id, req.params.id), eq(schema.deals.vendorId, vendorId)))
      .returning({ id: schema.deals.id });
    if (!res.length) throw notFound('Deal not found');
    return reply.status(204).send();
  });

  // Fulfilments (FR-VP-07): only this vendor's paid orders.
  app.get(
    '/vendor/orders',
    {
      schema: {
        tags: ['vendor'],
        querystring: z.object({
          status: z
            .enum(['awaiting_confirmation', 'confirmed', 'dispatched', 'delivered', 'rejected'])
            .optional(),
        }),
      },
    },
    async (req) => {
      const { vendorId } = await vendorOf(req);
      const conds = [
        eq(schema.fulfilments.vendorId, vendorId),
        inArray(schema.orders.status, [
          'paid',
          'in_fulfilment',
          'delivered',
          'completed',
          'disputed',
          'refunded',
          'cancelled',
        ]),
      ];
      if (req.query.status) conds.push(eq(schema.fulfilments.status, req.query.status));
      const rows = await db
        .selectDistinct({ o: schema.orders })
        .from(schema.fulfilments)
        .innerJoin(schema.orders, eq(schema.orders.id, schema.fulfilments.orderId))
        .where(and(...conds))
        .orderBy(desc(schema.orders.paidAt))
        .limit(200);
      const views = await orderViews(
        db,
        rows.map((r) => r.o),
        { vendorId },
      );
      // Vendors see what they must ship and where, not the buyer's whole order.
      return {
        orders: views.map((v) => ({
          ref: v.ref,
          paidAt: v.paidAt,
          deliveryMethod: v.deliveryMethod,
          recipient: v.recipient,
          phone: v.phone,
          address: v.address,
          fulfilments: v.fulfilments,
        })),
      };
    },
  );

  const fulfilmentAction =
    (event: FulfilmentEvent) =>
    async (req: { params: { id: string }; body?: unknown } & Parameters<typeof requireVendor>[1]) => {
      const { vendorId } = await vendorOf(req);
      const [f] = await db
        .select()
        .from(schema.fulfilments)
        .where(and(eq(schema.fulfilments.id, req.params.id), eq(schema.fulfilments.vendorId, vendorId)));
      if (!f) throw notFound('Order not found');
      const body = (req.body ?? {}) as { reason?: string; trackingRef?: string };
      return db.transaction(async (tx) => ({
        fulfilment: await transitionFulfilment(tx, f.id, event, {
          ...body,
          refund: async (orderId, amountKobo) => {
            await refund(tx, payments, orderId, amountKobo, `Vendor rejected: ${body.reason ?? ''}`.trim(), {
              fulfilmentId: f.id,
            });
          },
        }),
      }));
    };
  app.post(
    '/vendor/fulfilments/:id/confirm',
    { schema: { tags: ['vendor'], params: Id } },
    fulfilmentAction('confirm'),
  );
  app.post(
    '/vendor/fulfilments/:id/reject',
    { schema: { tags: ['vendor'], params: Id, body: RejectInput } },
    fulfilmentAction('reject'),
  );
  app.post(
    '/vendor/fulfilments/:id/dispatch',
    { schema: { tags: ['vendor'], params: Id, body: DispatchInput } },
    fulfilmentAction('dispatch'),
  );
  // [Default] until carrier webhooks exist (v1.1), the vendor records delivery.
  app.post(
    '/vendor/fulfilments/:id/deliver',
    { schema: { tags: ['vendor'], params: Id } },
    fulfilmentAction('deliver'),
  );

  // Custom requests (FR-VP-08).
  app.get('/vendor/requests', { schema: { tags: ['vendor'] } }, async (req) => {
    const { vendorId } = await vendorOf(req);
    const rows = await db
      .select({
        r: schema.customRequests,
        buyerName: schema.users.name,
        businessName: schema.users.businessName,
      })
      .from(schema.customRequests)
      .innerJoin(schema.users, eq(schema.users.id, schema.customRequests.buyerId))
      .where(and(eq(schema.customRequests.vendorId, vendorId), isNull(schema.customRequests.hiddenAt)))
      .orderBy(desc(schema.customRequests.createdAt));
    return {
      requests: rows.map(({ r, buyerName, businessName }) => ({
        ...r,
        buyer: { name: buyerName, businessName },
      })),
    };
  });

  const ownRequest = async (vendorId: string, id: string) => {
    const [r] = await db
      .select()
      .from(schema.customRequests)
      .where(
        and(
          eq(schema.customRequests.id, id),
          eq(schema.customRequests.vendorId, vendorId),
          isNull(schema.customRequests.hiddenAt),
        ),
      );
    if (!r) throw notFound('Request not found');
    if (!['new', 'quoted'].includes(r.status))
      throw conflict('REQUEST_CLOSED', 'This request is already closed');
    return r;
  };

  app.post(
    '/vendor/requests/:id/reply',
    { schema: { tags: ['vendor'], params: Id, body: RequestReplyInput } },
    async (req) => {
      const { vendor } = await vendorOf(req);
      const r = await ownRequest(vendor.id, req.params.id);
      const [row] = await db.transaction(async (tx) => {
        await enqueue(tx, 'notify.user', {
          to: r.buyerId,
          template: 'request_replied',
          data: { vendor: vendor.name, channels: ['email'] },
        });
        return tx
          .update(schema.customRequests)
          .set({ vendorReply: req.body.reply })
          .where(eq(schema.customRequests.id, r.id))
          .returning();
      });
      return { request: row };
    },
  );

  app.post(
    '/vendor/requests/:id/quote',
    { schema: { tags: ['vendor'], params: Id, body: RequestQuoteInput } },
    async (req) => {
      const { vendor } = await vendorOf(req);
      const r = await ownRequest(vendor.id, req.params.id);
      const [row] = await db.transaction(async (tx) => {
        await enqueue(tx, 'notify.user', {
          to: r.buyerId,
          template: 'request_quoted',
          data: { vendor: vendor.name, amountKobo: req.body.amountKobo, channels: ['sms', 'email'] },
        });
        return tx
          .update(schema.customRequests)
          .set({
            status: 'quoted',
            quotedAmountKobo: req.body.amountKobo,
            quoteExpiresAt: daysFromNow(req.body.validDays),
            vendorReply: req.body.reply || r.vendorReply,
          })
          .where(eq(schema.customRequests.id, r.id))
          .returning();
      });
      return { request: row };
    },
  );

  app.post(
    '/vendor/requests/:id/decline',
    { schema: { tags: ['vendor'], params: Id, body: RequestReplyInput.partial() } },
    async (req) => {
      const { vendorId } = await vendorOf(req);
      const r = await ownRequest(vendorId, req.params.id);
      const [row] = await db
        .update(schema.customRequests)
        .set({ status: 'declined', vendorReply: req.body.reply ?? r.vendorReply })
        .where(eq(schema.customRequests.id, r.id))
        .returning();
      return { request: row };
    },
  );

  // Licences (FR-ADM-08). documentKey points at the private bucket; uploads arrive with the storage provider.
  app.get('/vendor/licences', { schema: { tags: ['vendor'] } }, async (req) => {
    const { vendorId } = await vendorOf(req);
    return {
      licences: await db
        .select()
        .from(schema.vendorLicences)
        .where(eq(schema.vendorLicences.vendorId, vendorId))
        .orderBy(desc(schema.vendorLicences.createdAt)),
    };
  });

  app.post('/vendor/licences', { schema: { tags: ['vendor'], body: LicenceInput } }, async (req, reply) => {
    const { vendorId } = await vendorOf(req);
    const [row] = await db
      .insert(schema.vendorLicences)
      .values({
        vendorId,
        licenceType: req.body.licenceType,
        documentKey: req.body.documentKey,
        expiresAt: req.body.expiresOn ? new Date(`${req.body.expiresOn}T23:59:59+01:00`) : null,
      })
      .returning();
    return reply.status(201).send({ licence: row });
  });
};
