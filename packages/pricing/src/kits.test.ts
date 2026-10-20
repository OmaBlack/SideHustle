import { describe, expect, it } from 'vitest';
import { kitMetrics } from './kits.js';
import { PricingError } from './errors.js';
import { N, product } from '../test/helpers.js';

describe('kitMetrics', () => {
  const ps = new Map([
    ['a', product({ id: 'a', vendorId: 'va', costKobo: N(100), rrpKobo: N(200), stockQty: 10 })],
    ['b', product({ id: 'b', vendorId: 'vb', costKobo: N(50), rrpKobo: N(90) })],
  ]);
  it('is unavailable when any component is short (FR-KIT-05)', () => {
    const kit = {
      id: 'k',
      priceKobo: N(1_000),
      sortOrder: 1,
      items: [
        { productId: 'a', qty: 11 },
        { productId: 'b', qty: 2 },
      ],
    };
    expect(kitMetrics(kit, ps).available).toBe(false);
  });
  it('has no gap when the kit is priced at or above cost', () => {
    const kit = { id: 'k', priceKobo: N(2_000), sortOrder: 1, items: [{ productId: 'a', qty: 1 }] };
    const m = kitMetrics(kit, ps);
    expect(m.gapKobo).toBe(0);
    expect(m.components[0]!.payableKobo).toBe(N(100));
  });
  it('rejects unknown products and bad quantities', () => {
    expect(() =>
      kitMetrics({ id: 'k', priceKobo: N(1), sortOrder: 1, items: [{ productId: 'zz', qty: 1 }] }, ps),
    ).toThrow(PricingError);
    expect(() =>
      kitMetrics({ id: 'k', priceKobo: N(1), sortOrder: 1, items: [{ productId: 'a', qty: 0 }] }, ps),
    ).toThrow(PricingError);
  });
});
