import { allocate } from './allocate.js';
import { PricingError } from './errors.js';
import { kobo, margin, type Kobo } from './money.js';
import { inStock } from './qty.js';
import type { PricingKit, PricingProduct } from './types.js';

export interface KitComponent {
  productId: string;
  vendorId: string;
  qty: number;
  /** Wholesale cost of this component line (cost × qty). */
  costKobo: Kobo;
  /** This component's share of the kit price gap (section 8a), split by largest remainder. */
  gapShareKobo: Kobo;
  /** What the vendor is owed for this component before commission. */
  payableKobo: Kobo;
}

export interface KitMetrics {
  priceKobo: Kobo;
  /** Wholesale cost of the contents. */
  costKobo: Kobo;
  /** Resale value: Σ RRP × qty. */
  retailKobo: Kobo;
  /** Resale value − kit price (BR-04). */
  profitKobo: Kobo;
  marginPct: number;
  units: number;
  productCount: number;
  /** FR-KIT-05: every component can be supplied in full. */
  available: boolean;
  /** How far the kit price sits below the wholesale cost of its contents; 0 if it does not. */
  gapKobo: Kobo;
  /** Who absorbs the gap under the section 8a default rules. */
  gapFundedBy: 'vendors' | 'platform';
  components: KitComponent[];
}

export function kitMetrics(kit: PricingKit, products: ReadonlyMap<string, PricingProduct>): KitMetrics {
  let cost = 0;
  let retail = 0;
  let units = 0;
  let available = true;
  const lines = kit.items.map((it) => {
    const p = products.get(it.productId);
    if (!p)
      throw new PricingError('UNKNOWN_PRODUCT', `Kit ${kit.id} references unknown product ${it.productId}`);
    if (!Number.isInteger(it.qty) || it.qty < 1)
      throw new PricingError('INVALID_QTY', `Kit ${kit.id} has qty ${it.qty}`);
    const lineCost = p.costKobo * it.qty;
    cost += lineCost;
    retail += p.rrpKobo * it.qty;
    units += it.qty;
    if (!inStock(p, it.qty)) available = false;
    return { p, qty: it.qty, lineCost };
  });
  const gap = Math.max(0, cost - kit.priceKobo);
  const platform = !!kit.platformFunded;
  const shares = platform
    ? lines.map(() => kobo(0))
    : allocate(
        kobo(gap),
        lines.map((l) => l.lineCost),
      );
  return {
    priceKobo: kit.priceKobo,
    costKobo: kobo(cost),
    retailKobo: kobo(retail),
    profitKobo: kobo(retail - kit.priceKobo),
    marginPct: margin(kobo(retail), kit.priceKobo),
    units,
    productCount: lines.length,
    available,
    gapKobo: kobo(gap),
    gapFundedBy: platform ? 'platform' : 'vendors',
    components: lines.map((l, i) => ({
      productId: l.p.id,
      vendorId: l.p.vendorId,
      qty: l.qty,
      costKobo: kobo(l.lineCost),
      gapShareKobo: shares[i]!,
      payableKobo: kobo(l.lineCost - shares[i]!),
    })),
  };
}

/** Sums component gap shares per vendor, in first-appearance order. */
export function gapByVendor(metrics: KitMetrics): Map<string, Kobo> {
  const out = new Map<string, Kobo>();
  for (const c of metrics.components) out.set(c.vendorId, kobo((out.get(c.vendorId) ?? 0) + c.gapShareKobo));
  return out;
}
