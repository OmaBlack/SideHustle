import { describe, expect, it } from 'vitest';
import { freedomNumber } from './goals.js';
import { PricingError } from './errors.js';
import { N } from '../test/helpers.js';

const k = (kitId: string, price: number, profit: number, sortOrder: number, available = true) => ({
  kitId,
  priceKobo: N(price),
  profitKobo: N(profit),
  sortOrder,
  available,
});

describe('freedomNumber', () => {
  it('excludes zero or negative profit and unavailable kits', () => {
    const rows = freedomNumber(N(10_000), [
      k('a', 1, 0, 1),
      k('b', 1, -5, 2),
      k('c', 1, 100, 3, false),
      k('d', 1, 100, 4),
    ]);
    expect(rows.map((r) => r.kitId)).toEqual(['d']);
  });
  it('ties on count and price fall back to sortOrder, and the list is capped', () => {
    const rows = freedomNumber(
      N(100),
      [
        k('b', 5, 100, 2),
        k('a', 5, 100, 1),
        k('c', 4, 100, 9),
        k('d', 9, 100, 0),
        k('e', 9, 100, 5),
        k('f', 9, 100, 6),
      ],
      5,
    );
    expect(rows.map((r) => r.kitId)).toEqual(['c', 'a', 'b', 'd', 'e']);
  });
  it('rejects a goal of zero', () => {
    expect(() => freedomNumber(N(0), [])).toThrow(PricingError);
  });
});
