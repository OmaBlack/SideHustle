import { schema } from '@sidehustle/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DevProvider } from '../src/lib/payments/provider.js';
import { DevNotifier } from '../src/lib/notifier.js';
import { processRefund, retryPendingRefunds } from '../src/modules/payments/service.js';
import { drainOutbox, slaReminders } from '../src/modules/notifications/service.js';
import {
  checkout,
  Client,
  hasServices,
  ids,
  pay,
  PICKUP,
  setup,
  staffUser,
  verifiedBuyer,
  type Env,
} from './helpers.js';

const inDays = (d: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(
    new Date(Date.now() + d * 86_400_000),
  );

describe.skipIf(!hasServices)('vendor portal (FR-VP-01..08, UC-4, UC-6)', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env?.close());

  async function paidOrder(lines: unknown[]) {
    const buyer = await verifiedBuyer(env);
    for (const l of lines) await buyer.client.post('/cart/lines', l);
    const { order } = await checkout(buyer.client);
    await pay(buyer.client, order.ref);
    return { buyer, order: (await buyer.client.get(`/orders/${order.ref}`)).body.order };
  }

  it('lets a signed-in user apply as a vendor, pending until approved (FR-ADM-01)', async () => {
    const { client } = await verifiedBuyer(env);
    const res = await client.post('/vendor/apply', {
      name: 'Kano Spice Co',
      categoryId: ids.category('food'),
      location: 'Kano',
      acceptsCustom: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.vendor).toMatchObject({ status: 'pending', slug: 'kano-spice-co' });
    expect((await client.get('/vendor/me')).body.vendor.status).toBe('pending');
    expect((await new Client(env).get('/vendors/kano-spice-co')).status).toBe(404);
    expect(
      (
        await client.post('/vendor/apply', {
          name: 'Again',
          categoryId: ids.category('food'),
          location: 'Kano',
        })
      ).status,
    ).toBe(409);
  });

  it('keeps every vendor inside its own data (FR-VP-01, NFR-SEC-02)', async () => {
    const luxe = await staffUser(env, { role: 'vendor_staff', vendorSlug: 'luxe' });
    const cvhub = await staffUser(env, { role: 'vendor_staff', vendorSlug: 'cvhub' });
    const { order } = await paidOrder([{ kind: 'product', productId: ids.product('cable'), qty: 50 }]);
    const f = order.fulfilments[0];
    expect((await luxe.client.post(`/vendor/fulfilments/${f.id}/confirm`)).status).toBe(404);
    expect(
      (await luxe.client.get('/vendor/orders')).body.orders.map((o: { ref: string }) => o.ref),
    ).not.toContain(order.ref);
    expect(
      (await cvhub.client.get('/vendor/orders')).body.orders.map((o: { ref: string }) => o.ref),
    ).toContain(order.ref);
    const cableEdit = await luxe.client.put(`/vendor/products/${ids.product('cable')}`, {
      name: 'Hijack',
      categoryId: ids.category('phone'),
      unit: 'pc',
      costKobo: 100,
      rrpKobo: 100,
      moq: 1,
    });
    expect(cableEdit.status).toBe(404);
    expect((await luxe.client.del(`/vendor/products/${ids.product('cable')}`)).status).toBe(404);
    // Buyers are not vendors at all.
    expect((await (await verifiedBuyer(env)).client.get('/vendor/me')).status).toBe(403);
  });

  it('confirms, dispatches with tracking and delivers; the buyer sees each step (UC-6, FR-ORD-02/03)', async () => {
    const cvhub = await staffUser(env, { role: 'vendor_staff', vendorSlug: 'cvhub' });
    const { buyer, order } = await paidOrder([
      { kind: 'product', productId: ids.product('charger'), qty: 20 },
    ]);
    const f = order.fulfilments[0];
    expect(
      (await cvhub.client.post(`/vendor/fulfilments/${f.id}/dispatch`, { trackingRef: 'GIG123' })).status,
    ).toBe(409);
    expect((await cvhub.client.post(`/vendor/fulfilments/${f.id}/confirm`)).body.fulfilment.orderStatus).toBe(
      'in_fulfilment',
    );
    await cvhub.client.post(`/vendor/fulfilments/${f.id}/dispatch`, { trackingRef: 'GIG123' });
    const mid = (await buyer.client.get(`/orders/${order.ref}`)).body.order;
    expect(mid.fulfilments[0]).toMatchObject({ status: 'dispatched', stepsDone: 3, trackingRef: 'GIG123' });
    expect((await cvhub.client.post(`/vendor/fulfilments/${f.id}/deliver`)).body.fulfilment.orderStatus).toBe(
      'delivered',
    );
    const outbox = await env.db
      .select()
      .from(schema.outbox)
      .where(sql`${schema.outbox.dedupeKey} like ${'fulfilment_%:' + f.id}`);
    expect(outbox.map((o) => (o.payload as { template: string }).template).sort()).toEqual([
      'fulfilment_confirmed',
      'fulfilment_delivered',
      'fulfilment_dispatched',
    ]);
  });

  it('rejecting a fulfilment refunds its lines and releases stock; parent combines progress (AC-11)', async () => {
    await env.db.update(schema.products).set({ stockQty: 100 }).where(eq(schema.products.slug, 'chinchin'));
    const mamatee = await staffUser(env, { role: 'vendor_staff', vendorSlug: 'mamatee' });
    const cvhub = await staffUser(env, { role: 'vendor_staff', vendorSlug: 'cvhub' });
    const { buyer, order } = await paidOrder([
      { kind: 'product', productId: ids.product('chinchin'), qty: 40 },
      { kind: 'product', productId: ids.product('cable'), qty: 50 },
    ]);
    const snack = order.fulfilments.find((f: { vendor: { slug: string } }) => f.vendor.slug === 'mamatee');
    const cable = order.fulfilments.find((f: { vendor: { slug: string } }) => f.vendor.slug === 'cvhub');
    const r = await mamatee.client.post(`/vendor/fulfilments/${snack.id}/reject`, { reason: 'Out of flour' });
    expect(r.body.fulfilment).toMatchObject({ status: 'rejected', orderStatus: 'paid' });
    expect(
      (await env.db.select().from(schema.products).where(eq(schema.products.slug, 'chinchin')))[0]!.stockQty,
    ).toBe(100);
    const refunds = await env.db
      .select()
      .from(schema.refunds)
      .where(eq(schema.refunds.fulfilmentId, snack.id));
    expect(refunds[0]!.amountKobo).toBe(40 * 110_000);
    await cvhub.client.post(`/vendor/fulfilments/${cable.id}/confirm`);
    const after = (await buyer.client.get(`/orders/${order.ref}`)).body.order;
    expect(after.status).toBe('in_fulfilment');
    // Rejecting every fulfilment cancels the order.
    const solo = await paidOrder([{ kind: 'product', productId: ids.product('chinchin'), qty: 40 }]);
    await mamatee.client.post(`/vendor/fulfilments/${solo.order.fulfilments[0].id}/reject`, {
      reason: 'Closed',
    });
    expect((await solo.buyer.client.get(`/orders/${solo.order.ref}`)).body.order.status).toBe('cancelled');
  });

  it('refunds the delivery fee when the last fulfilment is rejected, but not on a partial rejection', async () => {
    await env.db.update(schema.products).set({ stockQty: 200 }).where(eq(schema.products.slug, 'chinchin'));
    const mamatee = await staffUser(env, { role: 'vendor_staff', vendorSlug: 'mamatee' });
    const lagos = {
      ...PICKUP,
      deliveryMethod: 'lagos',
      address: { line1: '1 Broad St', city: 'Ikeja', state: 'Lagos' },
    };
    const refundsFor = async (orderId: string) =>
      env.db
        .select({ amountKobo: schema.refunds.amountKobo })
        .from(schema.refunds)
        .innerJoin(schema.payments, eq(schema.payments.id, schema.refunds.paymentId))
        .where(eq(schema.payments.orderId, orderId));
    const buyOrder = async (lines: unknown[]) => {
      const buyer = await verifiedBuyer(env);
      for (const l of lines) await buyer.client.post('/cart/lines', l);
      const { order } = await checkout(buyer.client, lagos);
      await pay(buyer.client, order.ref);
      return { buyer, order: (await buyer.client.get(`/orders/${order.ref}`)).body.order };
    };

    const solo = await buyOrder([{ kind: 'product', productId: ids.product('chinchin'), qty: 40 }]);
    expect(solo.order.deliveryFeeKobo).toBe(350_000);
    await mamatee.client.post(`/vendor/fulfilments/${solo.order.fulfilments[0].id}/reject`, {
      reason: 'Closed',
    });
    expect((await solo.buyer.client.get(`/orders/${solo.order.ref}`)).body.order.status).toBe('cancelled');
    const sum = (rs: { amountKobo: number }[]) => rs.reduce((a, r) => a + r.amountKobo, 0);
    expect(sum(await refundsFor(solo.order.id))).toBe(40 * 110_000 + 350_000);

    const two = await buyOrder([
      { kind: 'product', productId: ids.product('chinchin'), qty: 40 },
      { kind: 'product', productId: ids.product('cable'), qty: 50 },
    ]);
    const snack = two.order.fulfilments.find(
      (f: { vendor: { slug: string } }) => f.vendor.slug === 'mamatee',
    );
    await mamatee.client.post(`/vendor/fulfilments/${snack.id}/reject`, { reason: 'Out of flour' });
    expect((await two.buyer.client.get(`/orders/${two.order.ref}`)).body.order.status).toBe('paid');
    expect(sum(await refundsFor(two.order.id))).toBe(40 * 110_000);

    const rows = await env.db.execute<{ s: string }>(
      sql`select sum(amount_kobo) as s from ledger_entries group by journal_id`,
    );
    expect(Array.from(rows).every((r) => Number(r.s) === 0)).toBe(true);
  });

  it('posts promos for own products only, validates headlines and holds contact details (UC-4, AC-10)', async () => {
    const arewa = await staffUser(env, { role: 'vendor_staff', vendorSlug: 'arewa' });
    const long = await arewa.client.post('/vendor/deals', {
      kind: 'promo',
      scope: 'product',
      productId: ids.product('shea'),
      discountPct: 10,
      headline: 'x'.repeat(61),
      endsOn: inDays(3),
    });
    expect(long.status).toBe(400);
    const theirs = await arewa.client.post('/vendor/deals', {
      kind: 'promo',
      scope: 'product',
      productId: ids.product('serum'),
      discountPct: 10,
      headline: 'Not mine',
      endsOn: inDays(3),
    });
    expect(theirs.status).toBe(403);
    const noEnd = await arewa.client.post('/vendor/deals', {
      kind: 'promo',
      scope: 'category',
      discountPct: 10,
      headline: 'Forever',
    });
    expect(noEnd.status).toBe(400);
    const ok = await arewa.client.post('/vendor/deals', {
      kind: 'promo',
      scope: 'product',
      productId: ids.product('shea'),
      discountPct: 25,
      headline: 'Shea week',
      endsOn: inDays(3),
    });
    expect(ok.body.deal.moderationStatus).toBe('approved');
    expect((await new Client(env).get('/products/shea')).body.product.unitKobo).toBe(165_000);
    const held = await arewa.client.post('/vendor/deals', {
      kind: 'launch',
      headline: 'Call 0803 123 4567 now',
    });
    expect(held.body).toMatchObject({ deal: { moderationStatus: 'pending' }, heldFor: ['phone'] });
    expect(
      (await arewa.client.get('/vendor/deals')).body.deals.map((d: { state: string }) => d.state).sort(),
    ).toEqual(['in_review', 'live']);
    expect((await arewa.client.del(`/vendor/deals/${ok.body.deal.id}`)).status).toBe(204);
    expect((await new Client(env).get('/products/shea')).body.product.unitKobo).toBe(220_000);
  });

  it('creates, edits and deactivates products; restricted ones wait for a licence (FR-VP-02, NFR-PRV-03)', async () => {
    const medlink = await staffUser(env, { role: 'vendor_staff', vendorSlug: 'medlink' });
    const base = {
      name: 'Zinc Tablets',
      categoryId: ids.category('health'),
      unit: 'pack',
      costKobo: 150_000,
      rrpKobo: 250_000,
      moq: 10,
    };
    const created = await medlink.client.post('/vendor/products', base);
    expect(created.body).toMatchObject({
      product: { status: 'active', slug: 'zinc-tablets' },
      heldFor: null,
    });
    expect((await medlink.client.post('/vendor/products', { ...base, rrpKobo: 100_000 })).status).toBe(400);
    // Admin restricts the whole health category behind a PCN licence.
    const admin = await staffUser(env, { role: 'admin' });
    await admin.client.post('/admin/restrictions', {
      categoryId: ids.category('health'),
      requiredLicence: 'PCN_PPMV',
    });
    const held = await medlink.client.put(`/vendor/products/${created.body.product.id}`, base);
    expect(held.body).toMatchObject({ product: { status: 'draft' }, heldFor: 'PCN_PPMV' });
    const lic = await medlink.client.post('/vendor/licences', {
      licenceType: 'PCN_PPMV',
      documentKey: 'kyc/medlink/pcn.pdf',
    });
    await admin.client.post(`/admin/licences/${lic.body.licence.id}/approve`);
    expect(
      (await medlink.client.put(`/vendor/products/${created.body.product.id}`, base)).body.product.status,
    ).toBe('active');
    expect((await medlink.client.del(`/vendor/products/${created.body.product.id}`)).status).toBe(204);
    expect((await new Client(env).get('/products/zinc-tablets')).status).toBe(404);
  });

  it('runs custom requests: buyer asks, vendor replies and quotes, buyer sees status (UC-5)', async () => {
    const luxe = await staffUser(env, { role: 'vendor_staff', vendorSlug: 'luxe' });
    const buyer = await verifiedBuyer(env);
    expect(
      (
        await new Client(env).post('/requests', {
          vendorId: ids.vendor('luxe'),
          projectType: 'white_label',
          brief: 'Fifty totes with my logo',
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await buyer.client.post('/requests', {
          vendorId: ids.vendor('arewa'),
          projectType: 'other',
          brief: 'Custom shea blend please',
        })
      ).body.code,
    ).toBe('NO_CUSTOM_WORK');
    const r = await buyer.client.post('/requests', {
      vendorId: ids.vendor('luxe'),
      projectType: 'white_label',
      brief: 'Fifty totes with my logo',
      quantityEstimate: 50,
    });
    expect(r.body.request.status).toBe('new');
    const list = (await luxe.client.get('/vendor/requests')).body.requests;
    expect(list[0]).toMatchObject({ status: 'new', buyer: { name: 'Test Buyer' } });
    await luxe.client.post(`/vendor/requests/${r.body.request.id}/reply`, {
      reply: 'Happy to help, what colour?',
    });
    await luxe.client.post(`/vendor/requests/${r.body.request.id}/quote`, {
      amountKobo: 90_000_000,
      reply: 'Tan, gold foil',
    });
    const mine = (await buyer.client.get('/me/requests')).body.requests[0];
    expect(mine).toMatchObject({
      status: 'quoted',
      quotedAmountKobo: 90_000_000,
      vendorReply: 'Tan, gold foil',
    });
    await luxe.client.post(`/vendor/requests/${r.body.request.id}/decline`, {});
    expect(
      (await luxe.client.post(`/vendor/requests/${r.body.request.id}/quote`, { amountKobo: 100 })).status,
    ).toBe(409);
  });
});

describe.skipIf(!hasServices)('admin console (FR-ADM-01..11) and worker jobs', () => {
  let env: Env;
  let admin: Awaited<ReturnType<typeof staffUser>>;
  beforeAll(async () => {
    env = await setup();
    admin = await staffUser(env, { role: 'admin' });
  });
  afterAll(async () => env?.close());

  it('is for admins only', async () => {
    const buyer = await verifiedBuyer(env);
    expect((await buyer.client.get('/admin/overview')).status).toBe(403);
    expect((await new Client(env).get('/admin/overview')).status).toBe(401);
    expect((await admin.client.get('/admin/overview')).status).toBe(200);
  });

  it('approves a vendor, shows the verified badge and writes the audit log (FR-ADM-01/06, BR-10)', async () => {
    const applicant = await verifiedBuyer(env);
    const v = (
      await applicant.client.post('/vendor/apply', {
        name: 'Owerri Oils',
        categoryId: ids.category('beauty'),
        location: 'Owerri',
      })
    ).body.vendor;
    expect(
      (await admin.client.get('/admin/vendors?status=pending')).body.vendors.map((x: { id: string }) => x.id),
    ).toContain(v.id);
    await admin.client.post(`/admin/vendors/${v.id}/approve`, { note: 'CAC checked' });
    expect((await new Client(env).get('/vendors/owerri-oils')).body.vendor.verified).toBe(true);
    await admin.client.post(`/admin/vendors/${v.id}/suspend`, {});
    expect((await new Client(env).get('/vendors/owerri-oils')).status).toBe(404);
    const log = (await admin.client.get('/admin/audit-log?entity=vendor')).body.entries;
    expect(log.map((e: { action: string }) => e.action).slice(0, 2)).toEqual([
      'vendor.suspend',
      'vendor.approve',
    ]);
    // The log cannot be edited, whichever role connects (FR-ADM-06).
    await expect(env.db.update(schema.auditLog).set({ action: 'x' })).rejects.toThrow();
  });

  it('moderates deals and requests (FR-ADM-02)', async () => {
    const [d] = await env.db
      .insert(schema.deals)
      .values({
        vendorId: ids.vendor('glow'),
        kind: 'launch',
        scope: 'category',
        categoryId: ids.category('beauty'),
        headline: 'Visit www.glow.ng',
        moderationStatus: 'pending',
      })
      .returning();
    expect(
      (await admin.client.get('/admin/deals?status=pending')).body.deals.map((x: { id: string }) => x.id),
    ).toContain(d!.id);
    await admin.client.post(`/admin/deals/${d!.id}/remove`, { reason: 'Links not allowed' });
    expect(
      (await env.db.select().from(schema.deals).where(eq(schema.deals.id, d!.id)))[0]!.moderationStatus,
    ).toBe('rejected');
    const buyer = await verifiedBuyer(env);
    const r = (
      await buyer.client.post('/requests', {
        vendorId: ids.vendor('luxe'),
        projectType: 'other',
        brief: 'Something rude enough to hide',
      })
    ).body.request;
    await admin.client.post(`/admin/requests/${r.id}/hide`, { reason: 'Abusive' });
    expect((await buyer.client.get('/me/requests')).body.requests).toHaveLength(0);
  });

  it('issues partial and full refunds, never more than was paid (FR-ADM-03)', async () => {
    const buyer = await verifiedBuyer(env);
    await buyer.client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('snack') });
    const { order } = await checkout(buyer.client);
    await pay(buyer.client, order.ref);
    expect(
      (
        await admin.client.post(`/admin/orders/${order.ref}/refunds`, {
          amountKobo: 1_000_000,
          reason: 'Damaged pack',
        })
      ).status,
    ).toBe(201);
    const detail = (await admin.client.get(`/admin/orders/${order.ref}`)).body;
    expect(detail).toMatchObject({ refundedKobo: 1_000_000, refundableKobo: 6_500_000 });
    expect(
      (
        await admin.client.post(`/admin/orders/${order.ref}/refunds`, {
          amountKobo: 6_500_001,
          reason: 'Too much',
        })
      ).body.code,
    ).toBe('REFUND_TOO_LARGE');
    await admin.client.post(`/admin/orders/${order.ref}/refunds`, { amountKobo: 6_500_000, reason: 'Rest' });
    expect((await buyer.client.get(`/orders/${order.ref}`)).body.order.status).toBe('refunded');
  });

  it('changes the bundle rule without a deploy (FR-ADM-04, NFR-MNT-02)', async () => {
    const rules = (await admin.client.get('/admin/bundle-rules')).body.items;
    const global = rules.find((r: { scope: string }) => r.scope === 'global');
    await admin.client.put(`/admin/bundle-rules/${global.id}`, {
      scope: 'global',
      scopeId: null,
      minKobo: 5_000_000,
      pct: 10,
    });
    const q = await new Client(env).post('/bundles/quote', {
      items: [{ productId: ids.product('plantain'), qty: 150 }],
    });
    expect(q.body.quote.discountKobo).toBe(525_000);
    // A vendor override applies only to that vendor's items.
    await admin.client.post('/admin/bundle-rules', {
      scope: 'vendor',
      scopeId: ids.vendor('ofada'),
      minKobo: 0,
      pct: 20,
    });
    const q2 = await new Client(env).post('/bundles/quote', {
      items: [{ productId: ids.product('plantain'), qty: 100 }],
    });
    expect(q2.body.quote.discountKobo).toBe(700_000);
  });

  it('manages kits and delivery methods (FR-ADM-05/11)', async () => {
    const kits = (await admin.client.get('/admin/kits')).body.kits;
    const snack = kits.find((k: { slug: string }) => k.slug === 'snack');
    await admin.client.put(`/admin/kits/${snack.id}`, {
      name: snack.name,
      categoryId: snack.categoryId,
      priceKobo: 7_000_000,
      tip: 'New tip',
      items: snack.items,
      extras: ['Stickers'],
      sortOrder: snack.sortOrder,
    });
    expect((await new Client(env).get('/kits/snack')).body.kit).toMatchObject({
      priceKobo: 7_000_000,
      tip: 'New tip',
      extras: ['Stickers'],
    });
    const methods = (await admin.client.get('/admin/delivery-methods')).body.items;
    const inter = methods.find((m: { code: string }) => m.code === 'inter');
    await admin.client.put(`/admin/delivery-methods/${inter.id}`, {
      ...inter,
      feeKobo: 900_000,
      partner: 'GIG Logistics',
      eligibleStates: [],
    });
    expect(
      (await new Client(env).get('/delivery-methods')).body.methods.find(
        (m: { code: string }) => m.code === 'inter',
      ).feeKobo,
    ).toBe(900_000);
  });

  it('runs the hub: receive, reserve on order, count, low stock (FR-ADM-07, FR-ORD-08)', async () => {
    await admin.client.put(`/admin/products/${ids.product('thermo')}/fulfilment-mode`, { mode: 'hub' });
    expect((await new Client(env).get('/kits/pharm')).body.kit.available).toBe(false);
    await admin.client.post('/admin/hub-stock/receive', { productId: ids.product('thermo'), qty: 30 });
    await admin.client.put('/admin/hub-stock/threshold', {
      productId: ids.product('thermo'),
      lowStockThreshold: 15,
    });
    expect((await new Client(env).get('/kits/pharm')).body.kit.available).toBe(true);
    const buyer = await verifiedBuyer(env);
    await buyer.client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('pharm') });
    const { order } = await checkout(buyer.client);
    expect(order.fulfilments.map((f: { kind: string }) => f.kind).sort()).toEqual([
      'hub',
      'vendor',
      'vendor',
      'vendor',
    ]);
    const item = () =>
      admin.client
        .get('/admin/hub-stock')
        .then((r) => r.body.items.find((i: { productId: string }) => i.productId === ids.product('thermo')));
    expect(await item()).toMatchObject({ onHand: 30, available: 10, low: true });
    await pay(buyer.client, order.ref);
    const hubF = (await buyer.client.get(`/orders/${order.ref}`)).body.order.fulfilments.find(
      (f: { kind: string }) => f.kind === 'hub',
    );
    await admin.client.post(`/admin/fulfilments/${hubF.id}/confirm`);
    await admin.client.post(`/admin/fulfilments/${hubF.id}/dispatch`, { trackingRef: 'HUB-1' });
    expect(await item()).toMatchObject({ onHand: 10, available: 10 });
    expect(
      (
        await admin.client.post('/admin/hub-stock/count', {
          productId: ids.product('thermo'),
          counted: 8,
          reason: 'Two damaged',
        })
      ).body.delta,
    ).toBe(-2);
    expect(await item()).toMatchObject({ onHand: 8, available: 8 });
  });

  it('changes config, commission and retention with an audit trail (FR-ADM-09/10)', async () => {
    await admin.client.put('/admin/config/order_expiry_minutes', { value: 45 });
    const c = (await admin.client.get('/admin/config')).body.config.find(
      (x: { key: string }) => x.key === 'order_expiry_minutes',
    );
    expect(c.value).toBe(45);
    expect(
      (
        await admin.client.post('/admin/commission-rules', {
          scope: 'category',
          scopeId: ids.category('food'),
          rateBps: 500,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await admin.client.post('/admin/retention', {
          dataType: 'orders',
          retainDays: 2190,
          action: 'archive',
        })
      ).status,
    ).toBe(201);
    const actions = (await admin.client.get('/admin/audit-log')).body.entries.map(
      (e: { action: string }) => e.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['config.update', 'commission_rule.create', 'retention_policy.create']),
    );
  });

  it('drains the outbox once per message and sends SMS and email (FR-NOT-01/02)', async () => {
    const notifier = new DevNotifier();
    await staffUser(env, { role: 'vendor_staff', vendorSlug: 'cleanchem' });
    await env.db.update(schema.outbox).set({ sentAt: new Date() });
    const buyer = await verifiedBuyer(env);
    await buyer.client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('home') });
    const { order } = await checkout(buyer.client);
    await pay(buyer.client, order.ref);
    const sent = await drainOutbox(env.db, notifier);
    expect(sent).toBeGreaterThanOrEqual(2);
    expect(
      notifier.sent
        .filter((m) => m.template === 'order_paid')
        .map((m) => m.channel)
        .sort(),
    ).toEqual(['email', 'sms']);
    expect(notifier.sent.some((m) => m.template === 'vendor_new_order')).toBe(true);
    expect(await drainOutbox(env.db, notifier)).toBe(0);
    // SLA: a paid order unconfirmed for 12 hours reminds the vendor, once.
    await env.db
      .update(schema.orders)
      .set({ paidAt: new Date(Date.now() - 13 * 3_600_000) })
      .where(eq(schema.orders.ref, order.ref));
    expect(await slaReminders(env.db)).toBeGreaterThan(0);
    await slaReminders(env.db);
    const reminders = await env.db
      .select()
      .from(schema.outbox)
      .where(and(sql`${schema.outbox.dedupeKey} like 'sla12:%'`));
    expect(new Set(reminders.map((r) => r.dedupeKey)).size).toBe(reminders.length);
  });
});

/** A dev provider whose refund call can be made to fail, and whose refund list can be faked. */
class FlakyProvider extends DevProvider {
  failing = 0;
  calls = 0;
  reported: number | null = null;
  override async refund(reference: string, amountKobo: number) {
    this.calls++;
    if (this.failing > 0) {
      this.failing--;
      throw new Error('provider down');
    }
    return super.refund(reference, amountKobo);
  }
  override async refundedAmount(reference: string) {
    return this.reported ?? super.refundedAmount(reference);
  }
}

describe.skipIf(!hasServices)('refunds are sent after commit and retried safely', () => {
  let env: Env;
  let flaky: FlakyProvider;
  let admin: Awaited<ReturnType<typeof staffUser>>;
  beforeAll(async () => {
    env = await setup({ payments: (origin) => (flaky = new FlakyProvider(origin)) });
    admin = await staffUser(env, { role: 'admin' });
  });
  afterAll(async () => env?.close());

  async function paidOrder() {
    const buyer = await verifiedBuyer(env);
    await buyer.client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('snack') });
    const { order } = await checkout(buyer.client);
    await pay(buyer.client, order.ref);
    return order as { id: string; ref: string };
  }
  const rowsFor = (orderId: string) =>
    env.db
      .select({ r: schema.refunds })
      .from(schema.refunds)
      .innerJoin(schema.payments, eq(schema.payments.id, schema.refunds.paymentId))
      .where(eq(schema.payments.orderId, orderId));
  const journalsFor = async (orderId: string) =>
    (
      await env.db
        .select()
        .from(schema.ledgerJournals)
        .where(and(eq(schema.ledgerJournals.orderId, orderId), eq(schema.ledgerJournals.kind, 'refund')))
    ).length;

  it('keeps a refund pending when the provider fails, then processes it once on retry', async () => {
    const order = await paidOrder();
    flaky.failing = 1;
    const res = await admin.client.post(`/admin/orders/${order.ref}/refunds`, {
      amountKobo: 1_000_000,
      reason: 'Damaged pack',
    });
    expect(res.status).toBe(201);
    expect(res.body.refund.status).toBe('pending');
    expect(await journalsFor(order.id)).toBe(0);

    expect(await processRefund(env.db, flaky, res.body.refund.id)).toBe('processed');
    expect(await processRefund(env.db, flaky, res.body.refund.id)).toBe('skipped');
    const rows = await rowsFor(order.id);
    expect(rows.map((x) => x.r.status)).toEqual(['processed']);
    expect(await journalsFor(order.id)).toBe(1);
  });

  it('does not call the provider again when it already shows the refund (no double pay)', async () => {
    const order = await paidOrder();
    flaky.failing = 1;
    const res = await admin.client.post(`/admin/orders/${order.ref}/refunds`, {
      amountKobo: 1_000_000,
      reason: 'Damaged pack',
    });
    expect(res.body.refund.status).toBe('pending');
    const callsBefore = flaky.calls;
    // The earlier attempt actually reached the provider, and the row is old enough to be a retry.
    flaky.reported = 1_000_000;
    await env.db
      .update(schema.refunds)
      .set({ createdAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(schema.refunds.id, res.body.refund.id));
    expect(await retryPendingRefunds(env.db, flaky)).toBeGreaterThanOrEqual(1);
    flaky.reported = null;
    expect(flaky.calls).toBe(callsBefore);
    const rows = await rowsFor(order.id);
    expect(rows.map((x) => x.r.status)).toEqual(['processed']);
    expect(await journalsFor(order.id)).toBe(1);
  });

  it('marks a refund failed after 24 hours of provider errors and audits it', async () => {
    const order = await paidOrder();
    flaky.failing = 1000;
    const res = await admin.client.post(`/admin/orders/${order.ref}/refunds`, {
      amountKobo: 1_000_000,
      reason: 'Damaged pack',
    });
    await env.db
      .update(schema.refunds)
      .set({ createdAt: new Date(Date.now() - 25 * 3_600_000) })
      .where(eq(schema.refunds.id, res.body.refund.id));
    await retryPendingRefunds(env.db, flaky);
    flaky.failing = 0;
    expect((await rowsFor(order.id))[0]!.r.status).toBe('failed');
    const log = await env.db
      .select()
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.action, 'refund.failed'), eq(schema.auditLog.entityId, res.body.refund.id)),
      );
    expect(log).toHaveLength(1);
    expect(await journalsFor(order.id)).toBe(0);
  });
});
