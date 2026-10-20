import { describe, expect, it } from 'vitest';
import {
  bundleQuote,
  effectivePrice,
  freedomNumber,
  kobo,
  validateQty,
  type BundleRule,
} from '../src/index.js';
import { prototypeBundleRules } from '../fixtures/prototype.js';
import { N, NOW, product, products, promo } from './helpers.js';

const global5: BundleRule[] = prototypeBundleRules;

describe('SRS acceptance criteria', () => {
  it('AC-01: a ₦99,999 bundle gets no discount', () => {
    const p = product({ id: 'p1', costKobo: N(99_999) });
    const q = bundleQuote([{ productId: 'p1', qty: 1 }], new Map([['p1', p]]), [], global5, NOW);
    expect(q.discountKobo).toBe(0);
    expect(q.payKobo).toBe(N(99_999));
  });

  it('AC-02: a ₦100,000 bundle gets ₦5,000 off and pays ₦95,000', () => {
    const p = product({ id: 'p1', costKobo: N(100_000) });
    const q = bundleQuote([{ productId: 'p1', qty: 1 }], new Map([['p1', p]]), [], global5, NOW);
    expect(q.discountKobo).toBe(N(5_000));
    expect(q.payKobo).toBe(N(95_000));
  });

  it('AC-03: quantity below MOQ is corrected to the MOQ', () => {
    const shea = products.get('shea')!;
    expect(validateQty(shea, 5)).toEqual({ ok: false, minQty: 20, reason: 'BELOW_MOQ' });
    expect(validateQty(shea, 20)).toEqual({ ok: true });
  });

  it('AC-04: 20% off ₦2,200 is ₦1,760, with the original kept for strike-through', () => {
    const shea = products.get('shea')!;
    const d = promo({ vendorId: 'arewa', productId: 'shea', discountPct: 20 });
    expect(effectivePrice(shea, [d], NOW)).toEqual({
      unitKobo: N(1_760),
      originalKobo: N(2_200),
      discountPct: 20,
      dealId: d.id,
    });
  });

  it('AC-05: a promo that ended yesterday is ignored', () => {
    const shea = products.get('shea')!;
    const d = promo({ vendorId: 'arewa', productId: 'shea', discountPct: 20, endsOn: '2026-10-19' });
    expect(effectivePrice(shea, [d], NOW).unitKobo).toBe(N(2_200));
  });

  it('AC-06: ₦100,000 goal at ₦38,000 profit needs 3 kits', () => {
    const rows = freedomNumber(N(100_000), [
      { kitId: 'k', priceKobo: N(50_000), profitKobo: N(38_000), sortOrder: 1, available: true },
    ]);
    expect(rows).toEqual([{ kitId: 'k', kitsPerMonth: 3, priceKobo: N(50_000) }]);
  });
});

describe('plan section 4 extra cases', () => {
  it("a category promo from one vendor leaves another vendor's product at full price", () => {
    const mine = product({ id: 'mine', vendorId: 'v1', categoryId: 'beauty', costKobo: N(1_000) });
    const theirs = product({ id: 'theirs', vendorId: 'v2', categoryId: 'beauty', costKobo: N(1_000) });
    const d = promo({
      vendorId: 'v1',
      scope: 'category',
      productId: null,
      categoryId: 'beauty',
      discountPct: 10,
    });
    expect(effectivePrice(mine, [d], NOW).unitKobo).toBe(N(900));
    expect(effectivePrice(theirs, [d], NOW).unitKobo).toBe(N(1_000));
  });

  it('a promo with a future starts_at is ignored', () => {
    const p = product({ id: 'p1' });
    const d = promo({ startsAt: new Date('2026-10-21T00:00:00Z') });
    expect(effectivePrice(p, [d], NOW).discountPct).toBe(0);
  });

  it('a half-naira promo price rounds up: Plantain Chips ₦350 at 5% off is ₦333', () => {
    const plantain = products.get('plantain')!;
    const d = promo({ vendorId: 'ofada', productId: 'plantain', discountPct: 5 });
    expect(effectivePrice(plantain, [d], NOW).unitKobo).toBe(N(333));
  });

  it("a vendor rule's threshold met while the global one is not discounts only that vendor's items", () => {
    const a = product({ id: 'a', vendorId: 'va', costKobo: N(30_000) });
    const b = product({ id: 'b', vendorId: 'vb', costKobo: N(30_000) });
    const rules: BundleRule[] = [
      { scope: 'global', minKobo: N(100_000), pct: 5 },
      { scope: 'vendor', scopeId: 'va', minKobo: N(50_000), pct: 10 },
    ];
    const q = bundleQuote(
      [
        { productId: 'a', qty: 1 },
        { productId: 'b', qty: 1 },
      ],
      new Map([
        ['a', a],
        ['b', b],
      ]),
      [],
      rules,
      NOW,
    );
    expect(q.costKobo).toBe(N(60_000));
    expect(q.discountKobo).toBe(N(3_000));
    expect(q.lines.map((l) => [l.eligible, l.discountKobo])).toEqual([
      [true, N(3_000)],
      [false, kobo(0)],
    ]);
  });
});
