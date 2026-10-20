import { describe, expect, it } from 'vitest';
import { fromNaira, kobo, margin, roundHalfUpToNaira, sumKobo } from './money.js';

describe('money', () => {
  it('kobo rejects fractions and unsafe integers', () => {
    expect(() => kobo(1.5)).toThrow(RangeError);
    expect(() => kobo(2 ** 53)).toThrow(RangeError);
    expect(kobo(0)).toBe(0);
  });

  it('fromNaira converts to kobo', () => {
    expect(fromNaira(2_200)).toBe(220_000);
  });

  it('rounds half-up to the whole naira', () => {
    expect(roundHalfUpToNaira(33_250 * 100, 100)).toBe(33_300); // ₦332.50 → ₦333
    expect(roundHalfUpToNaira(33_249 * 100, 100)).toBe(33_200);
    expect(roundHalfUpToNaira(0, 100)).toBe(0);
    expect(() => roundHalfUpToNaira(-1, 100)).toThrow(RangeError);
    expect(() => roundHalfUpToNaira(1, 0)).toThrow(RangeError);
  });

  it('margin is a whole percent, half-up', () => {
    expect(margin(fromNaira(248_000), fromNaira(125_000))).toBe(50); // 49.6
    expect(margin(fromNaira(200), fromNaira(101))).toBe(50); // 49.5 → 50
    expect(margin(fromNaira(200), fromNaira(300))).toBe(-50);
    expect(margin(fromNaira(200), fromNaira(201))).toBe(0); // -0.5 → 0 (half-up)
    expect(margin(kobo(0), fromNaira(1))).toBe(0);
  });

  it('sums kobo', () => {
    expect(sumKobo([kobo(1), kobo(2)])).toBe(3);
  });
});
