import { freedomNumber, fromNaira, gapByVendor, kitMetrics } from '@sidehustle/pricing';
import { GOLDEN_GOALS, GOLDEN_KITS, SHORT_KIT_NAMES } from '@sidehustle/pricing/fixtures/golden';
import { count } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadPricingCatalogue } from '../src/catalogue.js';
import * as s from '../src/schema/index.js';
import { applySeed, buildSeed, seedId } from '../src/seed/index.js';
import { freshDb, hasDb } from './db.js';

describe.skipIf(!hasDb)('seeded database (ticket 0.5)', () => {
  let conn: Awaited<ReturnType<typeof freshDb>>;
  beforeAll(async () => {
    conn = await freshDb();
    await applySeed(conn.db, buildSeed());
  });
  afterAll(() => conn?.close());

  it('is idempotent', async () => {
    await applySeed(conn.db, buildSeed());
    const [row] = await conn.db.select({ n: count() }).from(s.products);
    expect(row!.n).toBe(28);
  });

  it('reproduces the section 4 golden kit table', async () => {
    const cat = await loadPricingCatalogue(conn.db);
    for (const g of GOLDEN_KITS) {
      const m = kitMetrics(cat.kits!.get(seedId('kit', g.slug))!, cat.products);
      expect({
        name: g.name,
        price: m.priceKobo,
        cost: m.costKobo,
        retail: m.retailKobo,
        profit: m.profitKobo,
        margin: m.marginPct,
        units: m.units,
        gap: m.gapKobo,
      }).toEqual({
        name: g.name,
        price: fromNaira(g.price),
        cost: fromNaira(g.cost),
        retail: fromNaira(g.retail),
        profit: fromNaira(g.profit),
        margin: g.margin,
        units: g.units,
        gap: fromNaira(g.gap),
      });
      expect([...gapByVendor(m).values()].reduce((a, b) => a + b, 0)).toBe(fromNaira(g.gap));
    }
  });

  it('reproduces the freedom-number orderings', async () => {
    const cat = await loadPricingCatalogue(conn.db);
    const slugById = new Map(GOLDEN_KITS.map((g) => [seedId('kit', g.slug), g.slug]));
    const candidates = [...cat.kits!.values()].map((k) => {
      const m = kitMetrics(k, cat.products);
      return {
        kitId: k.id,
        priceKobo: k.priceKobo,
        profitKobo: m.profitKobo,
        sortOrder: k.sortOrder,
        available: m.available,
      };
    });
    for (const [goal, expected] of GOLDEN_GOALS) {
      const rows = freedomNumber(fromNaira(goal), candidates);
      expect(rows.map((r) => `${SHORT_KIT_NAMES[slugById.get(r.kitId)!]} ${r.kitsPerMonth}`).join(', ')).toBe(
        expected,
      );
    }
  });
});
