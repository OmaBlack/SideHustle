import { describe, expect, it } from 'vitest';
import { inStock, validateQty } from './qty.js';
import { product } from '../test/helpers.js';

describe('validateQty (BR-05)', () => {
  const p = product({ id: 'p', moq: 12 });
  it('enforces MOQ and integers', () => {
    expect(validateQty(p, 12)).toEqual({ ok: true });
    expect(validateQty(p, 11)).toEqual({ ok: false, minQty: 12, reason: 'BELOW_MOQ' });
    expect(validateQty(p, 12.5)).toEqual({ ok: false, minQty: 12, reason: 'NOT_INTEGER' });
    expect(validateQty(product({ id: 'z', moq: 0 }), 0)).toEqual({
      ok: false,
      minQty: 1,
      reason: 'BELOW_MOQ',
    });
  });
  it('kit lines are quantity 1', () => {
    expect(validateQty('kit', 1)).toEqual({ ok: true });
    expect(validateQty('kit', 2)).toEqual({ ok: false, minQty: 1, reason: 'KIT_QTY' });
  });
});

describe('inStock', () => {
  it('treats untracked stock as unlimited', () => {
    expect(inStock(product({ id: 'p', stockQty: null }), 1e6)).toBe(true);
    expect(inStock(product({ id: 'p', stockQty: 5 }), 5)).toBe(true);
    expect(inStock(product({ id: 'p', stockQty: 5 }), 6)).toBe(false);
  });
});
