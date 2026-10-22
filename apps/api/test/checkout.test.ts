import { schema } from '@sidehustle/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expireOrders } from '../src/modules/orders/service.js';
import {
  checkout,
  Client,
  hasServices,
  ids,
  newBuyer,
  pay,
  PICKUP,
  setup,
  verifiedBuyer,
  type Env,
} from './helpers.js';

describe.skipIf(!hasServices)('checkout, orders and payments (FR-CHK, FR-ORD, AC-07/08/11)', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env?.close());

  const journalsBalance = async () => {
    const rows = await env.db.execute<{ journal_id: string; s: string }>(
      sql`select journal_id, sum(amount_kobo) as s from ledger_entries group by journal_id`,
    );
    return Array.from(rows).every((r) => Number(r.s) === 0);
  };

  it('requires verified phone and email before the first checkout (FR-ACC-04)', async () => {
    const c = new Client(env);
    await c.post('/auth/signup', newBuyer());
    await c.post('/cart/lines', { kind: 'kit', kitId: ids.kit('snack') });
    const res = await c.post('/checkout/quote', PICKUP);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'VERIFICATION_REQUIRED',
      phoneVerified: false,
      emailVerified: false,
    });
  });

  it('needs an address for delivery and respects eligible states (FR-CHK-01/02)', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('snack') });
    const noAddr = await client.post('/checkout/quote', { ...PICKUP, deliveryMethod: 'lagos' });
    expect(noAddr.status).toBe(400);
    const wrongState = await client.post('/checkout/quote', {
      ...PICKUP,
      deliveryMethod: 'lagos',
      address: { line1: '1 Broad St', city: 'Ibadan', state: 'Oyo' },
    });
    expect(wrongState.body.code).toBe('DELIVERY_NOT_AVAILABLE');
    const ok = await client.post('/checkout/quote', {
      ...PICKUP,
      deliveryMethod: 'lagos',
      address: { line1: '1 Broad St', city: 'Ikeja', state: 'Lagos' },
    });
    expect(ok.body.quote).toMatchObject({
      subtotalKobo: 7_500_000,
      deliveryKobo: 350_000,
      totalKobo: 7_850_000,
    });
  });

  it('buys a starter kit end to end: quote, order, pay, Paid (UC-1)', async () => {
    const { client, user } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('skin') });
    const { order, payment } = await checkout(client);
    expect(order).toMatchObject({ status: 'pending_payment', totalKobo: 12_500_000 });
    expect(order.ref).toMatch(/^SH-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(payment.authorizationUrl).toBe(`http://web.test/pay/dev/${order.ref}`);
    // Three vendors in the skincare kit → three fulfilments (FR-ORD-04).
    expect(order.fulfilments).toHaveLength(3);
    expect((await client.get('/cart')).body.cart.count).toBe(0);
    expect(await pay(client, order.ref)).toBe('paid');
    const after = (await client.get(`/orders/${order.ref}`)).body.order;
    expect(after.status).toBe('paid');
    expect(after.lines[0]).toMatchObject({
      kind: 'kit',
      name: 'Skincare Reseller Kit',
      totalKobo: 12_500_000,
    });
    expect(after.lines[0].children).toHaveLength(3);
    expect(await journalsBalance()).toBe(true);
    // Vendors are owed the kit price (gap funded by vendors, section 8a), less commission.
    const payable = await env.db.execute<{ s: string }>(
      sql`select sum(amount_kobo) as s from ledger_entries e join ledger_journals j on j.id = e.journal_id where j.order_id = ${after.id} and e.account = 'vendor_payable' and j.kind = 'payment'`,
    );
    expect(Number(Array.from(payable)[0]!.s)).toBe(-12_500_000);
    const orders = (await client.get('/orders')).body.orders;
    expect(orders.map((o: { ref: string }) => o.ref)).toEqual([order.ref]);
    const msgs = await env.db
      .select()
      .from(schema.outbox)
      .where(sql`${schema.outbox.payload}->>'to' = ${user.id}`);
    expect(msgs.map((m) => (m.payload as { template: string }).template)).toContain('order_paid');
  });

  it('a replayed payment changes nothing and notifies once (AC-08)', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('home') });
    const { order } = await checkout(client);
    expect(await pay(client, order.ref)).toBe('paid');
    expect(await pay(client, order.ref)).toBe('duplicate');
    const [o] = await env.db.select().from(schema.orders).where(eq(schema.orders.ref, order.ref));
    const journals = await env.db
      .select()
      .from(schema.ledgerJournals)
      .where(eq(schema.ledgerJournals.orderId, o!.id));
    expect(journals.filter((j) => j.kind === 'payment')).toHaveLength(1);
    const paidMsgs = await env.db
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.dedupeKey, `order_paid:${o!.id}`));
    expect(paidMsgs).toHaveLength(1);
  });

  it('ignores prices sent by the browser (AC-07)', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', {
      kind: 'product',
      productId: ids.product('shea'),
      qty: 20,
      unitKobo: 1,
      priceKobo: 1,
    });
    const q = await client.post('/checkout/quote', { ...PICKUP, totalKobo: 100 });
    expect(q.body.quote.totalKobo).toBe(4_400_000);
    const o = await client.post(
      '/orders',
      { quoteId: q.body.quote.id, totalKobo: 1 },
      { 'idempotency-key': 'tamper-1234' },
    );
    expect(o.body.order.totalKobo).toBe(4_400_000);
  });

  it('is idempotent: the same key replays, a second key on the same quote returns the same order (FR-CHK-07)', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('snack') });
    const q = (await client.post('/checkout/quote', PICKUP)).body.quote;
    const a = await client.post('/orders', { quoteId: q.id }, { 'idempotency-key': 'same-key-123' });
    const b = await client.post('/orders', { quoteId: q.id }, { 'idempotency-key': 'same-key-123' });
    const c = await client.post('/orders', { quoteId: q.id }, { 'idempotency-key': 'other-key-456' });
    expect(a.status).toBe(201);
    expect(b.body.order.ref).toBe(a.body.order.ref);
    expect(c.body.order.ref).toBe(a.body.order.ref);
    expect(
      (
        await client.post(
          '/orders',
          { quoteId: '00000000-0000-4000-8000-000000000000' },
          { 'idempotency-key': 'same-key-123' },
        )
      ).status,
    ).toBe(422);
    const [row] = Array.from(
      await env.db.execute<{ n: number }>(
        sql`select count(*)::int as n from orders where quote_id = ${q.id}`,
      ),
    );
    expect(row?.n).toBe(1);
  });

  it('re-quotes when prices change between quote and order (FR-CHK-05)', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'product', productId: ids.product('cable'), qty: 50 });
    const q = (await client.post('/checkout/quote', PICKUP)).body.quote;
    await env.db.update(schema.products).set({ costKobo: 80_000 }).where(eq(schema.products.slug, 'cable'));
    const o = await client.post('/orders', { quoteId: q.id }, { 'idempotency-key': 'stale-quote-1' });
    expect(o.status).toBe(409);
    expect(o.body.code).toBe('QUOTE_STALE');
    // The fresh quote says what moved since the buyer last saw it (FR-CART-05).
    const q2 = (await client.post('/checkout/quote', PICKUP)).body.quote;
    expect(q2.changes).toEqual([expect.objectContaining({ fromKobo: 70_000, toKobo: 80_000 })]);
    expect(q2.totalKobo).toBe(4_000_000);
  });

  it('splits two vendors into two fulfilments with independent status (AC-11)', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'product', productId: ids.product('cable'), qty: 50 });
    await client.post('/cart/lines', { kind: 'product', productId: ids.product('chinchin'), qty: 40 });
    const { order } = await checkout(client);
    expect(order.fulfilments.map((f: { vendor: { name: string } }) => f.vendor.name).sort()).toEqual([
      'Computer Village Hub',
      'Mama Tee Snacks',
    ]);
  });

  it('reserves tracked stock, and expiry releases it (FR-CHK-09)', async () => {
    await env.db.update(schema.products).set({ stockQty: 60 }).where(eq(schema.products.slug, 'airfresh'));
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'product', productId: ids.product('airfresh'), qty: 48 });
    const { order } = await checkout(client);
    const stock = async () =>
      (await env.db.select().from(schema.products).where(eq(schema.products.slug, 'airfresh')))[0]!.stockQty;
    expect(await stock()).toBe(12);
    // Another buyer cannot take more than is left.
    const other = await verifiedBuyer(env);
    const cart = (
      await other.client.post('/cart/lines', { kind: 'product', productId: ids.product('airfresh'), qty: 48 })
    ).body.cart;
    expect(cart.lines[0].issues[0].code).toBe('OUT_OF_STOCK');
    await env.db
      .update(schema.orders)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.orders.ref, order.ref));
    expect(await expireOrders(env.db)).toBe(1);
    expect(await stock()).toBe(60);
    expect((await client.get(`/orders/${order.ref}`)).body.order.status).toBe('expired');
  });

  it('honours a late payment when stock is still free, and refunds it when it is not (plan section 7)', async () => {
    await env.db.update(schema.products).set({ stockQty: 48 }).where(eq(schema.products.slug, 'airfresh'));
    const a = await verifiedBuyer(env);
    await a.client.post('/cart/lines', { kind: 'product', productId: ids.product('airfresh'), qty: 48 });
    const first = await checkout(a.client);
    await env.db
      .update(schema.orders)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.orders.ref, first.order.ref));
    await expireOrders(env.db);
    expect(await pay(a.client, first.order.ref)).toBe('late_paid');
    expect(
      (await env.db.select().from(schema.products).where(eq(schema.products.slug, 'airfresh')))[0]!.stockQty,
    ).toBe(0);

    await env.db.update(schema.products).set({ stockQty: 48 }).where(eq(schema.products.slug, 'airfresh'));
    const b = await verifiedBuyer(env);
    await b.client.post('/cart/lines', { kind: 'product', productId: ids.product('airfresh'), qty: 48 });
    const second = await checkout(b.client);
    await env.db
      .update(schema.orders)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.orders.ref, second.order.ref));
    await expireOrders(env.db);
    // Someone else buys the stock in the meantime.
    const c = await verifiedBuyer(env);
    await c.client.post('/cart/lines', { kind: 'product', productId: ids.product('airfresh'), qty: 48 });
    await checkout(c.client);
    expect(await pay(b.client, second.order.ref)).toBe('late_refunded');
    const [o] = await env.db.select().from(schema.orders).where(eq(schema.orders.ref, second.order.ref));
    expect(o!.status).toBe('expired');
    const refunds = await env.db
      .select()
      .from(schema.refunds)
      .innerJoin(schema.payments, eq(schema.payments.id, schema.refunds.paymentId))
      .where(eq(schema.payments.orderId, o!.id));
    expect(refunds[0]!.refunds.amountKobo).toBe(o!.totalKobo);
    expect(await journalsBalance()).toBe(true);
  });

  it('stores line snapshots so later catalogue edits do not change orders (FR-ORD-07)', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'product', productId: ids.product('hibiscus'), qty: 10 });
    const { order } = await checkout(client);
    await env.db
      .update(schema.products)
      .set({ name: 'Renamed', costKobo: 999_900 })
      .where(eq(schema.products.slug, 'hibiscus'));
    const after = (await client.get(`/orders/${order.ref}`)).body.order;
    expect(after.lines[0]).toMatchObject({ unitKobo: 250_000, qty: 10 });
    expect(after.lines[0].name).not.toBe('Renamed');
  });

  it('keeps orders private to their buyer', async () => {
    const a = await verifiedBuyer(env);
    await a.client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('snack') });
    const { order } = await checkout(a.client);
    const b = await verifiedBuyer(env);
    expect((await b.client.get(`/orders/${order.ref}`)).status).toBe(403);
    const bundles = await env.db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.ref, order.ref)));
    expect(bundles).toHaveLength(1);
  });
});
