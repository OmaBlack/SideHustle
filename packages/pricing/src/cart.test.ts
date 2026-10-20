import { describe, expect, it } from 'vitest';
import { cartTotals, type CartContext } from './cart.js';
import { PricingError } from './errors.js';
import { indexById } from './types.js';
import { N, NOW, kits, product, products, promo } from '../test/helpers.js';
import { prototypeBundleRules } from '../fixtures/prototype.js';

const ctx = (over: Partial<CartContext> = {}): CartContext => ({
  catalogue: { products, kits },
  deals: [],
  bundleRules: prototypeBundleRules,
  deliveryFeeKobo: N(3_500),
  now: NOW,
  ...over,
});

describe('cartTotals (BR-09)', () => {
  it('sums product, kit and bundle lines, shows the bundle discount separately and adds delivery', () => {
    const d = promo({ vendorId: 'arewa', productId: 'shea', discountPct: 20 });
    const t = cartTotals(
      [
        { kind: 'product', productId: 'shea', qty: 20 },
        { kind: 'kit', kitId: 'snack', qty: 1 },
        { kind: 'bundle', name: 'Mine', qty: 1, items: [{ productId: 'powerbank', qty: 14 }] },
      ],
      ctx({ deals: [d] }),
    );
    // 20 × ₦1,760 + ₦75,000 + 14 × ₦7,500 (₦105,000, 5% off = ₦5,250)
    expect(t.subtotalKobo).toBe(N(35_200 + 75_000 + 105_000));
    expect(t.bundleDiscountKobo).toBe(N(5_250));
    expect(t.deliveryKobo).toBe(N(3_500));
    expect(t.totalKobo).toBe(N(35_200 + 75_000 + 105_000 - 5_250 + 3_500));
    expect(t.issues).toEqual([]);
    const first = t.lines[0]!;
    expect(first.kind === 'product' && first.originalUnitKobo).toBe(N(2_200));
    expect(first.kind === 'product' && first.dealId).toBe(d.id);
    expect(t.lines[2]!.kind === 'bundle' && t.lines[2]!.name).toBe('Mine');
  });

  it('flags MOQ, kit quantity and bundle issues', () => {
    const t = cartTotals(
      [
        { kind: 'product', productId: 'shea', qty: 1 },
        { kind: 'kit', kitId: 'home', qty: 2 },
        { kind: 'bundle', qty: 2, items: [{ productId: 'serum', qty: 1 }] },
      ],
      ctx(),
    );
    expect(t.issues.map((i) => [i.index, i.code])).toEqual([
      [0, 'BELOW_MOQ'],
      [1, 'KIT_QTY'],
      [2, 'KIT_QTY'],
      [2, 'BELOW_MOQ'],
    ]);
  });

  it('checks stock on combined demand across lines, kits included', () => {
    const limited = indexById([
      ...[...products.values()].filter((p) => p.id !== 'liquidsoap'),
      { ...products.get('liquidsoap')!, stockQty: 20 },
    ]);
    // The Home Cleaning Kit needs 12; another 12 on a product line makes 24 > 20.
    const t = cartTotals(
      [
        { kind: 'kit', kitId: 'home', qty: 1 },
        { kind: 'product', productId: 'liquidsoap', qty: 12 },
      ],
      ctx({ catalogue: { products: limited, kits } }),
    );
    expect(t.issues).toEqual([
      { index: 0, code: 'OUT_OF_STOCK', productId: 'liquidsoap' },
      { index: 1, code: 'OUT_OF_STOCK', productId: 'liquidsoap' },
    ]);
  });

  it('flags a kit with a missing component as unavailable', () => {
    const none = indexById([
      ...[...products.values()].filter((p) => p.id !== 'airfresh'),
      { ...products.get('airfresh')!, stockQty: 0 },
    ]);
    const t = cartTotals(
      [{ kind: 'kit', kitId: 'home', qty: 1 }],
      ctx({ catalogue: { products: none, kits } }),
    );
    expect(t.issues.map((i) => i.code)).toEqual(['KIT_UNAVAILABLE', 'OUT_OF_STOCK']);
  });

  it('rejects unknown ids and bad quantities', () => {
    expect(() => cartTotals([{ kind: 'product', productId: 'x', qty: 1 }], ctx())).toThrow(PricingError);
    expect(() => cartTotals([{ kind: 'kit', kitId: 'x', qty: 1 }], ctx())).toThrow(/Unknown kit/);
    expect(() =>
      cartTotals([{ kind: 'kit', kitId: 'home', qty: 1 }], ctx({ catalogue: { products } })),
    ).toThrow(/Unknown kit/);
    expect(() => cartTotals([{ kind: 'product', productId: 'shea', qty: 0 }], ctx())).toThrow(/Bad qty/);
  });

  it('re-pricing ignores whatever price a client might send (AC-07 at the pricing layer)', () => {
    const p = product({ id: 'p', costKobo: N(5_000) });
    const tampered = { kind: 'product' as const, productId: 'p', qty: 1, unitKobo: 1 } as never;
    const t = cartTotals(
      [tampered],
      ctx({ catalogue: { products: new Map([['p', p]]) }, deliveryFeeKobo: N(0) }),
    );
    expect(t.totalKobo).toBe(N(5_000));
  });
});
