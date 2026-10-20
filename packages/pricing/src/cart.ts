import { bundleQuote, type BundleItem, type BundleQuote, type LineIssue } from './bundles.js';
import { effectivePrice } from './deals.js';
import { PricingError } from './errors.js';
import { kitMetrics, type KitMetrics } from './kits.js';
import { kobo, type Kobo } from './money.js';
import { optionAddOn } from './options.js';
import { validateQty } from './qty.js';
import type { BundleRule, Catalogue, Deal, OptionSelection } from './types.js';

export type CartLine =
  | { kind: 'product'; productId: string; qty: number; selection?: OptionSelection; note?: string }
  | { kind: 'kit'; kitId: string; qty: number }
  | { kind: 'bundle'; name?: string; items: readonly BundleItem[]; qty: number };

interface PricedBase {
  qty: number;
  /** Price per unit before any bundle discount. */
  unitKobo: Kobo;
  /** unitKobo × qty. */
  lineTotalKobo: Kobo;
  /** Bundle discount on this line (bundles only), shown separately (BR-09). */
  discountKobo: Kobo;
}

export type PricedLine =
  | (PricedBase & {
      kind: 'product';
      productId: string;
      vendorId: string;
      originalUnitKobo: Kobo;
      discountPct: number;
      dealId?: string;
      optionText: string;
      isCustom: boolean;
    })
  | (PricedBase & { kind: 'kit'; kitId: string; kit: KitMetrics })
  | (PricedBase & { kind: 'bundle'; name?: string; bundle: BundleQuote });

export interface CartTotals {
  lines: PricedLine[];
  subtotalKobo: Kobo;
  bundleDiscountKobo: Kobo;
  deliveryKobo: Kobo;
  /** BR-09: Σ line totals − bundle discounts + delivery fee. */
  totalKobo: Kobo;
  /** Problems that must be fixed before checkout (MOQ, kit quantity, stock). Empty means the cart can be ordered. */
  issues: LineIssue[];
}

export interface CartContext {
  catalogue: Catalogue;
  deals: readonly Deal[];
  bundleRules: readonly BundleRule[];
  deliveryFeeKobo: Kobo;
  now: Date;
}

/**
 * Prices a cart (rule 7). Malformed lines (unknown ids, bad options) throw;
 * buyer-fixable problems come back in `issues`. Stock is checked on the
 * combined demand for each product across every line, kits and bundles
 * included.
 */
export function cartTotals(lines: readonly CartLine[], ctx: CartContext): CartTotals {
  const { products, kits } = ctx.catalogue;
  const issues: LineIssue[] = [];
  const demand = new Map<string, { qty: number; lines: Set<number> }>();
  const want = (productId: string, qty: number, index: number) => {
    const d = demand.get(productId) ?? { qty: 0, lines: new Set<number>() };
    d.qty += qty;
    d.lines.add(index);
    demand.set(productId, d);
  };

  const priced = lines.map((line, index): PricedLine => {
    if (!Number.isInteger(line.qty) || line.qty < 1)
      throw new PricingError('INVALID_QTY', `Bad qty ${line.qty}`);
    if (line.kind === 'product') {
      const p = products.get(line.productId);
      if (!p) throw new PricingError('UNKNOWN_PRODUCT', `Unknown product ${line.productId}`);
      const q = validateQty(p, line.qty);
      if (!q.ok) issues.push({ index, code: 'BELOW_MOQ', productId: p.id, minQty: q.minQty });
      const price = effectivePrice(p, ctx.deals, ctx.now);
      const opt = optionAddOn(p, line.selection, line.note);
      const unit = kobo(price.unitKobo + opt.addKobo);
      want(p.id, line.qty, index);
      return {
        kind: 'product',
        productId: p.id,
        vendorId: p.vendorId,
        qty: line.qty,
        unitKobo: unit,
        originalUnitKobo: kobo(price.originalKobo + opt.addKobo),
        discountPct: price.discountPct,
        ...(price.dealId ? { dealId: price.dealId } : {}),
        optionText: opt.text,
        isCustom: opt.isCustom,
        lineTotalKobo: kobo(unit * line.qty),
        discountKobo: kobo(0),
      };
    }
    if (line.kind === 'kit') {
      const k = kits?.get(line.kitId);
      if (!k) throw new PricingError('UNKNOWN_KIT', `Unknown kit ${line.kitId}`);
      if (!validateQty('kit', line.qty).ok) issues.push({ index, code: 'KIT_QTY' });
      const m = kitMetrics(k, products);
      if (!m.available) issues.push({ index, code: 'KIT_UNAVAILABLE', kitId: k.id });
      for (const it of k.items) want(it.productId, it.qty * line.qty, index);
      return {
        kind: 'kit',
        kitId: k.id,
        kit: m,
        qty: line.qty,
        unitKobo: k.priceKobo,
        lineTotalKobo: kobo(k.priceKobo * line.qty),
        discountKobo: kobo(0),
      };
    }
    if (!validateQty('kit', line.qty).ok) issues.push({ index, code: 'KIT_QTY' });
    const b = bundleQuote(line.items, products, ctx.deals, ctx.bundleRules, ctx.now);
    for (const i of b.issues) issues.push({ ...i, index });
    for (const it of line.items) want(it.productId, it.qty * line.qty, index);
    return {
      kind: 'bundle',
      ...(line.name !== undefined ? { name: line.name } : {}),
      bundle: b,
      qty: line.qty,
      unitKobo: b.costKobo,
      lineTotalKobo: kobo(b.costKobo * line.qty),
      discountKobo: kobo(b.discountKobo * line.qty),
    };
  });

  for (const [productId, d] of demand) {
    const p = products.get(productId)!;
    if (p.stockQty != null && d.qty > p.stockQty) {
      for (const index of d.lines) issues.push({ index, code: 'OUT_OF_STOCK', productId });
    }
  }
  issues.sort((a, b) => a.index - b.index);

  const subtotal = priced.reduce((s, l) => s + l.lineTotalKobo, 0);
  const discount = priced.reduce((s, l) => s + l.discountKobo, 0);
  return {
    lines: priced,
    subtotalKobo: kobo(subtotal),
    bundleDiscountKobo: kobo(discount),
    deliveryKobo: ctx.deliveryFeeKobo,
    totalKobo: kobo(subtotal - discount + ctx.deliveryFeeKobo),
    issues,
  };
}
