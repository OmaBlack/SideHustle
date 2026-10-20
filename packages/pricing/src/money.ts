/**
 * Money is integer kobo everywhere (₦1 = 100 kobo). The brand stops a plain
 * number (naira, a percentage, a quantity) being passed where kobo is expected.
 */
export type Kobo = number & { readonly __brand: 'Kobo' };

export const KOBO_PER_NAIRA = 100;

export function kobo(n: number): Kobo {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Kobo must be a safe integer, got ${n}`);
  return n as Kobo;
}

/** Whole naira to kobo. */
export function fromNaira(naira: number): Kobo {
  return kobo(naira * KOBO_PER_NAIRA);
}

/**
 * Divides `numerator` (kobo × some integer scale) by `scale` and rounds half-up
 * to the whole naira, returning kobo. Used for promo prices and bundle
 * discounts, which the plan rounds to whole naira **[Default]**.
 *
 * Example: Plantain Chips ₦350 at 5% off → 35000 × 95 / 100 = 33250 kobo → ₦333.
 */
export function roundHalfUpToNaira(numerator: number, scale: number): Kobo {
  if (!Number.isSafeInteger(numerator) || numerator < 0) throw new RangeError(`Bad numerator ${numerator}`);
  if (!Number.isSafeInteger(scale) || scale <= 0) throw new RangeError(`Bad scale ${scale}`);
  const n = BigInt(numerator);
  const d = BigInt(scale) * BigInt(KOBO_PER_NAIRA);
  const naira = (2n * n + d) / (2n * d);
  return kobo(Number(naira) * KOBO_PER_NAIRA);
}

/**
 * Margin as a whole percentage, rounded half-up: (rrp − paid) ÷ rrp (BR-04).
 * Returns 0 when there is no resale value to compare against.
 */
export function margin(rrpKobo: Kobo, paidKobo: Kobo): number {
  if (rrpKobo <= 0) return 0;
  const num = BigInt(rrpKobo - paidKobo) * 100n;
  const den = BigInt(rrpKobo);
  // floor((2·num + den) / (2·den)), with floor (not truncation) so negatives round correctly.
  const a = 2n * num + den;
  const b = 2n * den;
  const q = a / b;
  return Number(a % b < 0n ? q - 1n : q);
}

export function sumKobo(values: Iterable<Kobo>): Kobo {
  let s = 0;
  for (const v of values) s += v;
  return kobo(s);
}
