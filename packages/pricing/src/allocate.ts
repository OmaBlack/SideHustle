import { kobo, type Kobo } from './money.js';

/**
 * Splits `total` kobo across parts in proportion to `weights` using the
 * largest-remainder method (rule 8). Parts are whole kobo and always sum to
 * `total` exactly; remainder ties go to the earlier part.
 */
export function allocate(total: Kobo, weights: readonly number[]): Kobo[] {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new RangeError(`Total must be non-negative kobo, got ${total}`);
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0)
      throw new RangeError(`Weights must be non-negative integers, got ${w}`);
  }
  const W = weights.reduce((s, w) => s + BigInt(w), 0n);
  if (W === 0n) {
    if (total === 0) return weights.map(() => kobo(0));
    throw new RangeError('Cannot allocate a non-zero total across zero weights');
  }
  const T = BigInt(total);
  const base = weights.map((w) => (T * BigInt(w)) / W);
  const rem = weights.map((w, i) => ({ i, r: (T * BigInt(w)) % W }));
  let left = Number(T - base.reduce((s, b) => s + b, 0n));
  rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (let k = 0; k < left; k++) base[rem[k]!.i]! += 1n;
  left = 0;
  return base.map((b) => kobo(Number(b)));
}
