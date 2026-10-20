import { describe, expect, it } from 'vitest';
import { freedomNumber, gapByVendor, kitMetrics } from '../src/index.js';
import { prototype, prototypeKits } from '../fixtures/prototype.js';
import { GOLDEN_GOALS, GOLDEN_KITS, SHORT_KIT_NAMES } from '../fixtures/golden.js';
import { N, products } from './helpers.js';

const GOLDEN = GOLDEN_KITS;
const GAPS: Record<string, number> = Object.fromEntries(GOLDEN_KITS.map((g) => [g.name, g.gap]));

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
  const short = SHORT_KIT_NAMES;
  const cases = GOLDEN_GOALS;
  it.each(cases)('goal ₦%i', (goal, expected) => {
    const rows = freedomNumber(N(goal), candidates);
    expect(rows.map((r) => `${short[r.kitId]} ${r.kitsPerMonth}`).join(', ')).toBe(expected);
  });

  it('matches the prototype goal presets', () => {
    expect(prototype.goals).toEqual(cases.map(([g]) => g));
  });
});
