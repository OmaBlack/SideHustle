import { describe, expect, it } from 'vitest';
import { bundleQuote, resolveBundleRule } from './bundles.js';
import { PricingError } from './errors.js';
import type { BundleRule } from './types.js';
import { N, NOW, product, products, promo } from '../test/helpers.js';
import { prototypeBundleRules } from '../fixtures/prototype.js';

describe('resolveBundleRule', () => {
  const p = product({ id: 'p', vendorId: 'v', categoryId: 'c' });
  const g: BundleRule = { scope: 'global', minKobo: N(100_000), pct: 5 };
  const c: BundleRule = { scope: 'category', scopeId: 'c', minKobo: N(80_000), pct: 6 };
  const v: BundleRule = { scope: 'vendor', scopeId: 'v', minKobo: N(50_000), pct: 7 };
  it('prefers vendor, then category, then global', () => {
    expect(resolveBundleRule(p, [g, c, v])).toBe(v);
    expect(resolveBundleRule(p, [g, c])).toBe(c);
    expect(resolveBundleRule(p, [g])).toBe(g);
    expect(resolveBundleRule(p, [])).toBeNull();
  });
});

describe('bundleQuote', () => {
  it('counts promo prices and option add-ons toward the threshold and discount', () => {
    // 3 totes at ₦18,500 + Olive ₦1,000 + monogram ₦1,500 = ₦21,000 each → ₦63,000;
    // plus 12 serums at ₦3,500 = ₦42,000 → ₦105,000, over the ₦100,000 threshold.
    const q = bundleQuote(
      [
        { productId: 'lux-tote', qty: 3, selection: { colour: 'Olive', mono: true } },
        { productId: 'serum', qty: 12 },
      ],
      products,
      [],
      prototypeBundleRules,
      NOW,
    );
    expect(q.costKobo).toBe(N(105_000));
    expect(q.discountKobo).toBe(N(5_250));
    expect(q.payKobo).toBe(N(99_750));
    expect(q.lines.reduce((s, l) => s + l.discountKobo, 0)).toBe(q.discountKobo);
    expect(q.retailKobo).toBe(N(3 * 32_000 + 12 * 6_500));
    expect(q.vendorCount).toBe(2);
    expect(q.units).toBe(15);
    expect(q.lines[0]!.isCustom).toBe(true);
  });

  it('a promo can drop a bundle below the threshold', () => {
    const d = promo({ vendorId: 'arewa', productId: 'shea', discountPct: 10 });
    // 46 × ₦2,200 = ₦101,200; at ₦1,980 it is ₦91,080.
    const q = bundleQuote([{ productId: 'shea', qty: 46 }], products, [d], prototypeBundleRules, NOW);
    expect(q.costKobo).toBe(N(91_080));
    expect(q.discountKobo).toBe(0);
    expect(q.lines[0]!.dealId).toBe(d.id);
  });

  it('rounds the discount once, half-up to the naira', () => {
    const p = product({ id: 'p', costKobo: N(100_010) });
    // 5% of ₦100,010 = ₦5,000.50 → ₦5,001
    const q = bundleQuote([{ productId: 'p', qty: 1 }], new Map([['p', p]]), [], prototypeBundleRules, NOW);
    expect(q.discountKobo).toBe(N(5_001));
  });

  it('reports MOQ issues without throwing', () => {
    const q = bundleQuote([{ productId: 'shea', qty: 2 }], products, [], prototypeBundleRules, NOW);
    expect(q.issues).toEqual([{ index: 0, code: 'BELOW_MOQ', productId: 'shea', minQty: 20 }]);
  });

  it('applies no discount when no rule is configured', () => {
    const q = bundleQuote(
      [{ productId: 'phone', qty: 1 }].map(() => ({ productId: 'powerbank', qty: 20 })),
      products,
      [],
      [],
      NOW,
    );
    expect(q.discountKobo).toBe(0);
    expect(q.lines[0]!.rule).toBeNull();
  });

  it('rejects empty bundles, unknown products and bad quantities', () => {
    expect(() => bundleQuote([], products, [], [], NOW)).toThrow(PricingError);
    expect(() => bundleQuote([{ productId: 'nope', qty: 1 }], products, [], [], NOW)).toThrow(
      /Unknown product/,
    );
    expect(() => bundleQuote([{ productId: 'shea', qty: 0 }], products, [], [], NOW)).toThrow(/Bad qty/);
  });
});
