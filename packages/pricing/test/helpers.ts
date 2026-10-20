import { fromNaira, indexById, type Deal, type PricingProduct } from '../src/index.js';
import { prototypeKits, prototypeProducts } from '../fixtures/prototype.js';

export const N = fromNaira;
export const products = indexById(prototypeProducts);
export const kits = indexById(prototypeKits);
/** Midday in Lagos on 20 Oct 2026. */
export const NOW = new Date('2026-10-20T11:00:00Z');

export function product(over: Partial<PricingProduct> & { id: string }): PricingProduct {
  return {
    vendorId: 'v1',
    categoryId: 'c1',
    costKobo: N(1000),
    rrpKobo: N(2000),
    moq: 1,
    stockQty: null,
    ...over,
  };
}

let seq = 0;
export function promo(over: Partial<Deal> = {}): Deal {
  seq += 1;
  return {
    id: `d${seq}`,
    vendorId: 'v1',
    kind: 'promo',
    scope: 'product',
    productId: 'p1',
    categoryId: null,
    discountPct: 10,
    headline: 'Deal',
    startsAt: null,
    endsOn: '2026-10-31',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...over,
  };
}
