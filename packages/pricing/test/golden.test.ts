import { describe, expect, it } from 'vitest';
import { freedomNumber, gapByVendor, kitMetrics } from '../src/index.js';
import { prototype, prototypeKits } from '../fixtures/prototype.js';
import { N, products } from './helpers.js';

// Section 4 golden table, computed from the prototype's own data.
const GOLDEN = [
  {
    name: 'Skincare Reseller Kit',
    price: 125_000,
    cost: 131_000,
    retail: 248_000,
    profit: 123_000,
    margin: 50,
    units: 82,
  },
  {
    name: 'Leather Gifting Kit',
    price: 98_000,
    cost: 104_000,
    retail: 221_000,
    profit: 123_000,
    margin: 56,
    units: 36,
  },
  {
    name: 'Health Corner Kit',
    price: 125_000,
    cost: 133_800,
    retail: 244_800,
    profit: 119_800,
    margin: 49,
    units: 70,
  },
  {
    name: 'Phone Accessories Starter',
    price: 215_000,
    cost: 228_000,
    retail: 425_000,
    profit: 210_000,
    margin: 49,
    units: 90,
  },
  {
    name: 'Menswear Basics Kit',
    price: 124_000,
    cost: 130_800,
    retail: 264_000,
    profit: 140_000,
    margin: 53,
    units: 36,
  },
  {
    name: 'Snack Box Kit',
    price: 75_000,
    cost: 79_000,
    retail: 150_000,
    profit: 75_000,
    margin: 50,
    units: 140,
  },
  {
    name: 'Home Cleaning Kit',
    price: 62_000,
    cost: 64_800,
    retail: 132_000,
    profit: 70_000,
    margin: 53,
    units: 60,
  },
];

// Section 8a: price gap per kit.
const GAPS: Record<string, number> = {
  'Skincare Reseller Kit': 6_000,
  'Leather Gifting Kit': 6_000,
  'Health Corner Kit': 8_800,
  'Phone Accessories Starter': 13_000,
  'Menswear Basics Kit': 6_800,
  'Snack Box Kit': 4_000,
  'Home Cleaning Kit': 2_800,
};

const kitByName = (name: string) => {
  const i = prototype.kits.findIndex((k) => k.name === name);
  return prototypeKits[i]!;
};

describe('kit golden table', () => {
  it.each(GOLDEN)('$name', (g) => {
    const m = kitMetrics(kitByName(g.name), products);
    expect(m.priceKobo).toBe(N(g.price));
    expect(m.costKobo).toBe(N(g.cost));
    expect(m.retailKobo).toBe(N(g.retail));
    expect(m.profitKobo).toBe(N(g.profit));
    expect(m.marginPct).toBe(g.margin);
    expect(m.units).toBe(g.units);
    expect(m.available).toBe(true);
  });

  it('covers all seven prototype kits', () => {
    expect(prototype.kits.map((k) => k.name).sort()).toEqual(GOLDEN.map((g) => g.name).sort());
  });
});

describe('kit gap funding (section 8a)', () => {
  it.each(Object.entries(GAPS))('%s gap is split across its vendors exactly', (name, gap) => {
    const m = kitMetrics(kitByName(name), products);
    expect(m.gapKobo).toBe(N(gap));
    expect(m.gapFundedBy).toBe('vendors');
    const shares = m.components.map((c) => c.gapShareKobo);
    expect(shares.reduce((s, x) => s + x, 0)).toBe(N(gap));
    const byVendor = gapByVendor(m);
    expect([...byVendor.values()].reduce((s, x) => s + x, 0)).toBe(N(gap));
    for (const c of m.components) {
      // Each share is within one kobo of its exact proportional value.
      const exact = (m.gapKobo * c.costKobo) / m.costKobo;
      expect(Math.abs(c.gapShareKobo - exact)).toBeLessThan(1);
      expect(c.payableKobo).toBe(c.costKobo - c.gapShareKobo);
    }
    expect(m.components.reduce((s, c) => s + c.payableKobo, 0)).toBe(m.priceKobo);
  });

  it('a platform-funded kit leaves vendor shares at zero', () => {
    const m = kitMetrics({ ...kitByName('Snack Box Kit'), platformFunded: true }, products);
    expect(m.gapFundedBy).toBe('platform');
    expect(m.components.every((c) => c.gapShareKobo === 0 && c.payableKobo === c.costKobo)).toBe(true);
  });
});

describe('freedom number golden orderings', () => {
  const candidates = prototypeKits.map((k) => {
    const m = kitMetrics(k, products);
    return {
      kitId: k.id,
      priceKobo: k.priceKobo,
      profitKobo: m.profitKobo,
      sortOrder: k.sortOrder,
      available: m.available,
    };
  });
  const short: Record<string, string> = {
    home: 'Home Cleaning',
    snack: 'Snack Box',
    leather: 'Leather Gifting',
    fashion: 'Menswear',
    skin: 'Skincare',
    pharm: 'Health Corner',
    phone: 'Phone Accessories',
  };
  const cases: [number, string][] = [
    [50_000, 'Home Cleaning 1, Snack Box 1, Leather Gifting 1, Menswear 1, Skincare 1'],
    [100_000, 'Leather Gifting 1, Menswear 1, Skincare 1, Health Corner 1, Phone Accessories 1'],
    [250_000, 'Menswear 2, Phone Accessories 2, Leather Gifting 3, Skincare 3, Health Corner 3'],
    [500_000, 'Phone Accessories 3, Menswear 4, Leather Gifting 5, Skincare 5, Health Corner 5'],
  ];
  it.each(cases)('goal ₦%i', (goal, expected) => {
    const rows = freedomNumber(N(goal), candidates);
    expect(rows.map((r) => `${short[r.kitId]} ${r.kitsPerMonth}`).join(', ')).toBe(expected);
  });

  it('matches the prototype goal presets', () => {
    expect(prototype.goals).toEqual(cases.map(([g]) => g));
  });
});
