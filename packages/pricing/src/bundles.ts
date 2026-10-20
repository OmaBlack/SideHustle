import { allocate } from './allocate.js';
import { effectivePrice } from './deals.js';
import { PricingError } from './errors.js';
import { kobo, margin, roundHalfUpToNaira, type Kobo } from './money.js';
import { optionAddOn } from './options.js';
import { validateQty } from './qty.js';
import type { BundleRule, Deal, OptionSelection, PricingProduct } from './types.js';

export interface BundleItem {
  productId: string;
  qty: number;
  selection?: OptionSelection;
  note?: string;
}

export interface BundleLine {
  productId: string;
  vendorId: string;
  qty: number;
  /** Effective unit price (after any promo) plus option add-ons. */
  unitKobo: Kobo;
  dealId?: string;
  optionText: string;
  isCustom: boolean;
  /** unitKobo × qty, before the bundle discount. */
  costKobo: Kobo;
  /** The bundle rule this item resolved to, or null when none is configured. */
  rule: BundleRule | null;
  eligible: boolean;
  /** This line's share of the bundle discount (rule 8). */
  discountKobo: Kobo;
}

export type LineIssue =
  | { index: number; code: 'BELOW_MOQ'; productId: string; minQty: number }
  | { index: number; code: 'OUT_OF_STOCK'; productId: string }
  | { index: number; code: 'KIT_QTY' }
  | { index: number; code: 'KIT_UNAVAILABLE'; kitId: string };

export interface BundleQuote {
  costKobo: Kobo;
  discountKobo: Kobo;
  payKobo: Kobo;
  retailKobo: Kobo;
  profitKobo: Kobo;
  marginPct: number;
  units: number;
  vendorCount: number;
  lines: BundleLine[];
  /** MOQ problems the buyer can fix. Stock is checked across the whole cart by `cartTotals`. */
  issues: LineIssue[];
}

/** Most specific rule for a product: vendor, then category, then global. */
export function resolveBundleRule(product: PricingProduct, rules: readonly BundleRule[]): BundleRule | null {
  return (
    rules.find((r) => r.scope === 'vendor' && r.scopeId === product.vendorId) ??
    rules.find((r) => r.scope === 'category' && r.scopeId === product.categoryId) ??
    rules.find((r) => r.scope === 'global') ??
    null
  );
}

/**
 * Rule 4 (BR-03, FR-BLD-04). Bundle cost counts promo prices and option
 * add-ons. Each item is discounted at its own rule's percentage when the
 * whole bundle's cost meets that rule's threshold. The discount is rounded
 * once, half-up to the naira, and split back over the lines by largest
 * remainder.
 */
export function bundleQuote(
  items: readonly BundleItem[],
  products: ReadonlyMap<string, PricingProduct>,
  deals: readonly Deal[],
  rules: readonly BundleRule[],
  now: Date,
): BundleQuote {
  if (items.length === 0) throw new PricingError('EMPTY_BUNDLE', 'A bundle needs at least one item');
  const issues: LineIssue[] = [];
  const partial = items.map((it, index) => {
    const p = products.get(it.productId);
    if (!p) throw new PricingError('UNKNOWN_PRODUCT', `Unknown product ${it.productId}`);
    if (!Number.isInteger(it.qty) || it.qty < 1) throw new PricingError('INVALID_QTY', `Bad qty ${it.qty}`);
    const q = validateQty(p, it.qty);
    if (!q.ok) issues.push({ index, code: 'BELOW_MOQ', productId: p.id, minQty: q.minQty });
    const price = effectivePrice(p, deals, now);
    const opt = optionAddOn(p, it.selection, it.note);
    const unit = price.unitKobo + opt.addKobo;
    return {
      p,
      qty: it.qty,
      unit,
      dealId: price.dealId,
      opt,
      cost: unit * it.qty,
      retail: p.rrpKobo * it.qty,
      rule: resolveBundleRule(p, rules),
    };
  });
  const cost = partial.reduce((s, l) => s + l.cost, 0);
  const weights = partial.map((l) => (l.rule && cost >= l.rule.minKobo ? l.cost * l.rule.pct : 0));
  const discount = roundHalfUpToNaira(
    weights.reduce((s, w) => s + w, 0),
    100,
  );
  const shares = allocate(discount, weights);
  const retail = partial.reduce((s, l) => s + l.retail, 0);
  const pay = cost - discount;
  return {
    costKobo: kobo(cost),
    discountKobo: discount,
    payKobo: kobo(pay),
    retailKobo: kobo(retail),
    profitKobo: kobo(retail - pay),
    marginPct: margin(kobo(retail), kobo(pay)),
    units: partial.reduce((s, l) => s + l.qty, 0),
    vendorCount: new Set(partial.map((l) => l.p.vendorId)).size,
    lines: partial.map((l, i) => ({
      productId: l.p.id,
      vendorId: l.p.vendorId,
      qty: l.qty,
      unitKobo: kobo(l.unit),
      ...(l.dealId ? { dealId: l.dealId } : {}),
      optionText: l.opt.text,
      isCustom: l.opt.isCustom,
      costKobo: kobo(l.cost),
      rule: l.rule,
      eligible: weights[i]! > 0,
      discountKobo: shares[i]!,
    })),
    issues,
  };
}
