import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate } from './allocate.js';
import { kobo } from './money.js';

describe('allocate (largest remainder)', () => {
  it('splits proportionally and breaks remainder ties by order', () => {
    expect(allocate(kobo(100), [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(kobo(10), [1, 2])).toEqual([3, 7]);
  });

  it('handles zero totals and rejects impossible splits', () => {
    expect(allocate(kobo(0), [0, 0])).toEqual([0, 0]);
    expect(() => allocate(kobo(1), [0, 0])).toThrow(RangeError);
    expect(() => allocate(kobo(-1), [1])).toThrow(RangeError);
    expect(() => allocate(kobo(1), [-1])).toThrow(RangeError);
  });

  it('parts always sum to the total and stay within one kobo of exact', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e12 }),
        fc
          .array(fc.integer({ min: 0, max: 1e10 }), { minLength: 1, maxLength: 20 })
          .filter((w) => w.some((x) => x > 0)),
        (total, weights) => {
          const parts = allocate(kobo(total), weights);
          expect(parts.reduce((s, p) => s + p, 0)).toBe(total);
          const W = weights.reduce((s, w) => s + w, 0);
          parts.forEach((p, i) => expect(Math.abs(p - (total * weights[i]!) / W)).toBeLessThan(1 + 1e-6));
        },
      ),
    );
  });
});
