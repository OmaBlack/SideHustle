import { kobo, roundHalfUpToNaira, type Kobo } from './money.js';
import { lagosDate } from './time.js';
import type { Deal, PricingProduct } from './types.js';

/**
 * BR-06: a deal is live when it has a headline, a promo has a discount above
 * zero, it has started, and its end date (if any) is not before today in Lagos.
 */
export function isLive(deal: Deal, now: Date): boolean {
  if (!deal.headline.trim()) return false;
  if (deal.kind === 'promo' && !(deal.discountPct > 0)) return false;
  if (deal.startsAt && deal.startsAt.getTime() > now.getTime()) return false;
  if (deal.endsOn && deal.endsOn < lagosDate(now)) return false;
  return true;
}

/**
 * Whether a promo targets this product. A vendor's promo only ever touches its
 * own products, whether it names the product or the product's category (rule 1).
 */
export function promoAppliesTo(deal: Deal, product: PricingProduct): boolean {
  if (deal.kind !== 'promo' || deal.vendorId !== product.vendorId) return false;
  if (deal.scope === 'product') return deal.productId === product.id;
  return deal.categoryId === product.categoryId;
}

export interface EffectivePrice {
  unitKobo: Kobo;
  originalKobo: Kobo;
  discountPct: number;
  dealId?: string;
}

/**
 * BR-01: the wholesale price, or the wholesale price less the single highest
 * live promo, rounded half-up to the whole naira. Promos never stack. Equal
 * discounts resolve to the newest deal, then the lower id, so the result is
 * deterministic.
 */
export function effectivePrice(product: PricingProduct, deals: readonly Deal[], now: Date): EffectivePrice {
  let best: Deal | undefined;
  for (const d of deals) {
    if (!promoAppliesTo(d, product) || !isLive(d, now)) continue;
    if (
      !best ||
      d.discountPct > best.discountPct ||
      (d.discountPct === best.discountPct &&
        (d.createdAt.getTime() > best.createdAt.getTime() ||
          (d.createdAt.getTime() === best.createdAt.getTime() && d.id < best.id)))
    ) {
      best = d;
    }
  }
  const originalKobo = product.costKobo;
  if (!best) return { unitKobo: originalKobo, originalKobo, discountPct: 0 };
  const pct = Math.min(100, best.discountPct);
  const unitKobo = roundHalfUpToNaira(originalKobo * (100 - pct), 100);
  return { unitKobo: kobo(unitKobo), originalKobo, discountPct: pct, dealId: best.id };
}

/** Live deals, newest first (used for the slideshow and deal lists). */
export function liveDeals(deals: readonly Deal[], now: Date): Deal[] {
  return deals.filter((d) => isLive(d, now)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
