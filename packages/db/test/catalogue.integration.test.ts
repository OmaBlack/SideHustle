import { cartTotals, freedomNumber, fromNaira, kitMetrics, kobo, type Catalogue } from '@sidehustle/pricing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPricingCatalogue } from '../src/catalogue.js';
import * as s from '../src/schema/index.js';
import { applySeed, buildSeed, seedId } from '../src/seed/index.js';
import { freshDb, hasDb } from './db.js';

function candidatesOf(cat: Catalogue) {
  return [...cat.kits!.values()].map((k) => {
    const m = kitMetrics(k, cat.products);
    return {
      kitId: k.id,
      priceKobo: k.priceKobo,
      profitKobo: m.profitKobo,
      sortOrder: k.sortOrder,
      available: m.available,
    };
  });
}

describe.skipIf(!hasDb)('loadPricingCatalogue kit availability', () => {
  let conn: Awaited<ReturnType<typeof freshDb>>;
  const skin = seedId('kit', 'skin');
  const shea = seedId('product', 'shea');

  beforeEach(async () => {
    conn = await freshDb();
    await applySeed(conn.db, buildSeed());
  });
  afterEach(() => conn?.close());

  async function expectSkinUnavailable() {
    const cat = await loadPricingCatalogue(conn.db);
    const m = kitMetrics(cat.kits!.get(skin)!, cat.products);
    expect(m.available).toBe(false);
    expect(cat.products.get(shea)?.stockQty).toBe(0);
    const rows = freedomNumber(fromNaira(100_000), candidatesOf(cat));
    expect(rows.some((r) => r.kitId === skin)).toBe(false);
  }

  it('prices every active kit and skin is available', async () => {
    const cat = await loadPricingCatalogue(conn.db);
    for (const k of cat.kits!.values()) expect(() => kitMetrics(k, cat.products)).not.toThrow();
    expect(kitMetrics(cat.kits!.get(skin)!, cat.products).available).toBe(true);
  });

  it('keeps a kit priceable but unavailable when a component is archived', async () => {
    await conn.db.update(s.products).set({ status: 'archived' }).where(eq(s.products.id, shea));
    await expectSkinUnavailable();
  });

  it('keeps a kit priceable but unavailable when a component is soft-deleted', async () => {
    await conn.db.update(s.products).set({ deletedAt: new Date() }).where(eq(s.products.id, shea));
    await expectSkinUnavailable();
  });

  it('treats products of a suspended vendor as out of stock', async () => {
    const [row] = await conn.db.select().from(s.products).where(eq(s.products.id, shea));
    const vendorId = row!.vendorId;
    await conn.db.update(s.vendors).set({ status: 'suspended' }).where(eq(s.vendors.id, vendorId));
    const cat = await loadPricingCatalogue(conn.db);
    expect(kitMetrics(cat.kits!.get(skin)!, cat.products).available).toBe(false);
    const vendorProducts = [...cat.products.values()].filter((p) => p.vendorId === vendorId);
    expect(vendorProducts.length).toBeGreaterThan(0);
    for (const p of vendorProducts) expect(p.stockQty).toBe(0);
    const ctx = { catalogue: cat, deals: [], bundleRules: [], deliveryFeeKobo: kobo(0), now: new Date() };
    const t = cartTotals([{ kind: 'product', productId: shea, qty: 20 }], ctx);
    expect(t.issues.some((i) => i.code === 'OUT_OF_STOCK')).toBe(true);
  });

  it('leaves a non-sellable product that no kit uses out of the map', async () => {
    const seed = buildSeed();
    const inKit = new Set(seed.kitItems.map((i) => i.productId));
    const free = seed.products.find((p) => !inKit.has(p.id));
    expect(free).toBeDefined();
    await conn.db.update(s.products).set({ status: 'archived' }).where(eq(s.products.id, free!.id));
    const cat = await loadPricingCatalogue(conn.db);
    expect(cat.products.has(free!.id)).toBe(false);
  });
});
