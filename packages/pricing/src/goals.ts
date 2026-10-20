import { PricingError } from './errors.js';
import type { Kobo } from './money.js';

export interface GoalCandidate {
  kitId: string;
  priceKobo: Kobo;
  profitKobo: Kobo;
  sortOrder: number;
  available: boolean;
}

export interface GoalRow {
  kitId: string;
  kitsPerMonth: number;
  priceKobo: Kobo;
}

/**
 * FR-GOAL-02/03: kits needed per month to reach a profit goal, ceil(goal ÷
 * profit), fewest first, then cheaper, then `sortOrder`; top `limit`. Kits that
 * make no profit, or cannot be bought now **[Default]**, are left out.
 */
export function freedomNumber(goalKobo: Kobo, kits: readonly GoalCandidate[], limit = 5): GoalRow[] {
  if (!Number.isSafeInteger(goalKobo) || goalKobo <= 0)
    throw new PricingError('BAD_GOAL', 'Goal must be above zero');
  return kits
    .filter((k) => k.available && k.profitKobo > 0)
    .map((k) => ({
      kitId: k.kitId,
      priceKobo: k.priceKobo,
      sortOrder: k.sortOrder,
      kitsPerMonth: Math.floor((goalKobo + k.profitKobo - 1) / k.profitKobo),
    }))
    .sort((a, b) => a.kitsPerMonth - b.kitsPerMonth || a.priceKobo - b.priceKobo || a.sortOrder - b.sortOrder)
    .slice(0, limit)
    .map(({ kitId, kitsPerMonth, priceKobo }) => ({ kitId, kitsPerMonth, priceKobo }));
}
