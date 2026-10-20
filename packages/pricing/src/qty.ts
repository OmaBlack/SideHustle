import type { PricingProduct } from './types.js';

export type QtyCheck =
  { ok: true } | { ok: false; minQty: number; reason: 'BELOW_MOQ' | 'NOT_INTEGER' | 'KIT_QTY' };

/**
 * BR-05: product lines must meet their MOQ; kit and bundle lines are quantity 1.
 * On failure, `minQty` is the quantity the UI should correct to (AC-03).
 */
export function validateQty(product: PricingProduct | 'kit', qty: number): QtyCheck {
  if (product === 'kit') return qty === 1 ? { ok: true } : { ok: false, minQty: 1, reason: 'KIT_QTY' };
  const min = Math.max(1, product.moq);
  if (!Number.isInteger(qty)) return { ok: false, minQty: min, reason: 'NOT_INTEGER' };
  if (qty < min) return { ok: false, minQty: min, reason: 'BELOW_MOQ' };
  return { ok: true };
}

/** True when the product can supply `qty` units now. Untracked stock is always available. */
export function inStock(product: PricingProduct, qty: number): boolean {
  return product.stockQty == null || product.stockQty >= qty;
}
