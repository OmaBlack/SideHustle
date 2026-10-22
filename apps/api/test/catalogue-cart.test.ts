import { schema } from '@sidehustle/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, hasServices, ids, setup, verifiedBuyer, type Env } from './helpers.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
const yesterday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(Date.now() - 86_400_000));

describe.skipIf(!hasServices)('catalogue (FR-HOME, FR-SRCH, FR-PROD, FR-KIT, FR-GOAL)', () => {
  let env: Env;
  const anon = () => new Client(env);
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env?.close());

  it('lists 6 categories with product counts (FR-HOME-05)', async () => {
    const res = await anon().get('/categories');
    expect(res.body.categories).toHaveLength(6);
    expect(
      res.body.categories.reduce((s: number, c: { productCount: number }) => s + c.productCount, 0),
    ).toBe(28);
  });

  it('searches name, vendor, location and category case-insensitively (FR-SRCH-01, AC-12)', async () => {
    const byLoc = await anon().get('/products?q=kano');
    expect(byLoc.body.products.map((p: { slug: string }) => p.slug)).toEqual(['shea']);
    const byCat = await anon().get('/products?q=PHONE%20%26%20gadgets');
    expect(byCat.body.products).toHaveLength(4);
    expect((await anon().get('/products?q=zzzz')).body.products).toEqual([]);
    expect((await anon().get('/products?category=food')).body.products).toHaveLength(3);
  });

  it('reproduces the golden kit table (plan section 4)', async () => {
    const res = await anon().get('/kits');
    const skin = res.body.kits.find((k: { slug: string }) => k.slug === 'skin');
    expect(skin).toMatchObject({
      priceKobo: 12_500_000,
      costKobo: 13_100_000,
      retailKobo: 24_800_000,
      profitKobo: 12_300_000,
      marginPct: 50,
      units: 82,
      available: true,
    });
    const kit = await anon().get('/kits/skin');
    expect(kit.body.kit.items).toHaveLength(3);
    expect(kit.body.kit.extras).toContain('60 branded pouches');
  });

  it('ranks the freedom number for ₦100,000 (FR-GOAL-02/03)', async () => {
    const res = await anon().get('/kits/goal?amount=10000000');
    expect(
      res.body.rows.map((r: { slug: string; kitsPerMonth: number }) => `${r.slug}:${r.kitsPerMonth}`),
    ).toEqual(['leather:1', 'fashion:1', 'skin:1', 'pharm:1', 'phone:1']);
  });

  it('applies a live promo to the vendor’s own products only, highest wins, and ignores expired ones (BR-01, AC-04, AC-05)', async () => {
    await env.db.insert(schema.deals).values([
      {
        vendorId: ids.vendor('arewa'),
        kind: 'promo',
        scope: 'product',
        productId: ids.product('shea'),
        categoryId: ids.category('beauty'),
        discountPct: 20,
        headline: 'Shea 20% off',
        endsOn: today(),
        moderationStatus: 'approved',
      },
      {
        vendorId: ids.vendor('arewa'),
        kind: 'promo',
        scope: 'category',
        categoryId: ids.category('beauty'),
        discountPct: 10,
        headline: 'Beauty 10% off',
        endsOn: today(),
        moderationStatus: 'approved',
      },
      {
        vendorId: ids.vendor('glow'),
        kind: 'promo',
        scope: 'product',
        productId: ids.product('serum'),
        categoryId: ids.category('beauty'),
        discountPct: 30,
        headline: 'Expired',
        endsOn: yesterday(),
        moderationStatus: 'approved',
      },
      {
        vendorId: ids.vendor('glow'),
        kind: 'promo',
        scope: 'product',
        productId: ids.product('serum'),
        categoryId: ids.category('beauty'),
        discountPct: 40,
        headline: 'Not moderated yet',
        endsOn: today(),
        moderationStatus: 'pending',
      },
    ]);
    const shea = (await anon().get('/products/shea')).body.product;
    expect(shea).toMatchObject({ unitKobo: 176_000, originalKobo: 220_000, discountPct: 20, marginPct: 56 });
    const soap = (await anon().get('/products/blacksoap')).body.product;
    expect(soap.discountPct).toBe(0);
    const serum = (await anon().get('/products/serum')).body.product;
    expect(serum.discountPct).toBe(0);
    const slides = (await anon().get('/slides')).body.slides;
    expect(slides).toHaveLength(4);
    expect(slides.filter((s: { type: string }) => s.type === 'deal')).toHaveLength(2);
  });

  it('quotes a product with options; promos never touch add-ons (BR-02)', async () => {
    const p = (await anon().get('/products/lux-tote')).body.product;
    const opt = p.options[0];
    const sel = opt.type === 'check' ? { [opt.id]: true } : { [opt.id]: opt.values.at(-1).value };
    const q = await anon().post(`/products/${p.id}/quote`, { qty: 1, selection: sel });
    expect(q.body.minQty).toBe(3);
    expect(q.body.unitKobo).toBeGreaterThanOrEqual(p.unitKobo);
    expect((await anon().post(`/products/${p.id}/quote`, { qty: 3, selection: { nope: true } })).status).toBe(
      400,
    );
  });

  it('quotes a bundle with the 5% discount from ₦100,000 (AC-01, AC-02)', async () => {
    // 20 × ₦4,999.95 does not exist; use plantain ₦350 × n: 285 → ₦99,750 (no discount), 286 → ₦100,100 (5%).
    const below = await anon().post('/bundles/quote', {
      items: [{ productId: ids.product('plantain'), qty: 285 }],
    });
    expect(below.body.quote.discountKobo).toBe(0);
    const above = await anon().post('/bundles/quote', {
      items: [{ productId: ids.product('plantain'), qty: 286 }],
    });
    expect(above.body.quote).toMatchObject({
      costKobo: 10_010_000,
      discountKobo: 500_500,
      payKobo: 9_509_500,
    });
  });

  it('lists verified vendors only and shows a vendor page (FR-VEN-01/02/06)', async () => {
    await env.db.update(schema.vendors).set({ status: 'suspended' }).where(eq(schema.vendors.slug, 'bodija'));
    const res = await anon().get('/vendors');
    expect(res.body.vendors.map((v: { slug: string }) => v.slug)).not.toContain('bodija');
    expect((await anon().get('/vendors/bodija')).status).toBe(404);
    const luxe = (await anon().get('/vendors/luxe')).body;
    expect(luxe.vendor).toMatchObject({ verified: true, acceptsCustom: true });
    expect(luxe.products).toHaveLength(6);
    // A suspended vendor's product makes nothing purchasable.
    expect((await anon().get('/products?category=food')).body.products).toHaveLength(2);
  });
});

describe.skipIf(!hasServices)('cart (FR-CART-01..05)', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env?.close());

  it('merges identical product lines and keeps different options apart (FR-CART-02)', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'product', productId: ids.product('shea'), qty: 20 });
    const res = await client.post('/cart/lines', { kind: 'product', productId: ids.product('shea'), qty: 5 });
    expect(res.body.cart.lines).toHaveLength(1);
    expect(res.body.cart.lines[0]).toMatchObject({ qty: 25, unitKobo: 220_000, lineTotalKobo: 5_500_000 });
    await client.post('/cart/lines', {
      kind: 'product',
      productId: ids.product('shea'),
      qty: 20,
      note: 'Label: Bisi',
    });
    expect((await client.get('/cart')).body.cart.count).toBe(2);
  });

  it('flags lines below MOQ and blocks checkout until fixed (BR-05, AC-03)', async () => {
    const { client } = await verifiedBuyer(env);
    const res = await client.post('/cart/lines', {
      kind: 'product',
      productId: ids.product('serum'),
      qty: 3,
    });
    const line = res.body.cart.lines[0];
    expect(line.issues[0]).toMatchObject({ code: 'BELOW_MOQ', minQty: 12 });
    expect(res.body.cart.canCheckout).toBe(false);
    const fixed = await client.patch(`/cart/lines/${line.id}`, { qty: 12 });
    expect(fixed.body.cart.canCheckout).toBe(true);
  });

  it('holds kit and bundle lines at quantity 1 (FR-KIT-04, FR-BLD-06)', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('skin') });
    const res = await client.post('/cart/lines', {
      kind: 'bundle',
      name: 'My mix',
      items: [{ productId: ids.product('plantain'), qty: 286 }],
    });
    const kit = res.body.cart.lines.find((l: { kind: string }) => l.kind === 'kit');
    const bundle = res.body.cart.lines.find((l: { kind: string }) => l.kind === 'bundle');
    expect(kit).toMatchObject({ qty: 1, unitKobo: 12_500_000 });
    expect(bundle).toMatchObject({ name: 'My mix', discountKobo: 500_500, vendorCount: 1 });
    expect(res.body.cart.totalKobo).toBe(12_500_000 + 10_010_000 - 500_500);
    expect((await client.patch(`/cart/lines/${kit.id}`, { qty: 2 })).status).toBe(400);
  });

  it('flags a price change since the line was added, until acknowledged (FR-CART-05)', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'product', productId: ids.product('chinchin'), qty: 40 });
    await env.db
      .update(schema.products)
      .set({ costKobo: 120_000 })
      .where(eq(schema.products.slug, 'chinchin'));
    const res = await client.get('/cart');
    expect(res.body.cart.hasChanges).toBe(true);
    expect(res.body.cart.lines[0].changes.price).toEqual({ fromKobo: 110_000, toKobo: 120_000 });
    const ack = await client.post('/cart/ack');
    expect(ack.body.cart.hasChanges).toBe(false);
  });

  it('merges a logged-out draft after login and drops lines that no longer price', async () => {
    const { client } = await verifiedBuyer(env);
    const res = await client.post('/cart/merge', {
      lines: [
        { kind: 'product', productId: ids.product('cable'), qty: 50 },
        { kind: 'product', productId: ids.product('cable'), qty: 50, selection: { invented: true } },
      ],
    });
    expect(res.body.skipped).toBe(1);
    expect(res.body.cart.lines).toHaveLength(1);
  });

  it('saves, re-prices and deletes builder kits (FR-BLD-05)', async () => {
    const { client } = await verifiedBuyer(env);
    const saved = await client.post('/me/bundles', {
      name: 'Office snacks',
      items: [{ productId: ids.product('chinchin'), qty: 40 }],
    });
    expect(saved.status).toBe(201);
    const list = await client.get('/me/bundles');
    expect(list.body.bundles[0].quote.costKobo).toBeGreaterThan(0);
    expect((await client.del(`/me/bundles/${saved.body.bundle.id}`)).status).toBe(204);
    expect((await new Client(env).post('/me/bundles', { name: 'x', items: [] })).status).toBe(400);
  });
});
