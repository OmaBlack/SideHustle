import type { Kobo } from './money.js';

export type CheckOption = { type: 'check'; id: string; label: string; addKobo: Kobo };
export type SelectOption = {
  type: 'select';
  id: string;
  label: string;
  values: ReadonlyArray<{ value: string; addKobo: Kobo }>;
};
export type ProductOption = CheckOption | SelectOption;

/** A ticked check option is `true`; a select option holds the chosen value. */
export type OptionSelection = Readonly<Record<string, boolean | string>>;

export interface PricingProduct {
  id: string;
  vendorId: string;
  categoryId: string;
  /** Wholesale price per unit. */
  costKobo: Kobo;
  /** Recommended resale price per unit. */
  rrpKobo: Kobo;
  moq: number;
  options?: readonly ProductOption[];
  /** Units that can be sold now (vendor-declared or hub on-hand). `null`/absent = not tracked, always in stock. */
  stockQty?: number | null;
}

export interface Deal {
  id: string;
  vendorId: string;
  kind: 'promo' | 'launch';
  scope: 'product' | 'category';
  productId?: string | null;
  categoryId?: string | null;
  /** Whole percent, 1–90 for promos, 0 for launches. */
  discountPct: number;
  headline: string;
  startsAt?: Date | null;
  /** Last day the deal is live, as an Africa/Lagos calendar date (YYYY-MM-DD). */
  endsOn?: string | null;
  createdAt: Date;
}

export interface KitItem {
  productId: string;
  qty: number;
}

export interface PricingKit {
  id: string;
  priceKobo: Kobo;
  items: readonly KitItem[];
  /** Final tie-break for the freedom number and listings. */
  sortOrder: number;
  /** When true the platform, not the component vendors, absorbs the kit's price gap (section 8a). */
  platformFunded?: boolean;
}

export interface BundleRule {
  scope: 'global' | 'category' | 'vendor';
  /** Category or vendor id; omitted for the global rule. */
  scopeId?: string | null;
  minKobo: Kobo;
  /** Whole percent. */
  pct: number;
}

export interface Catalogue {
  products: ReadonlyMap<string, PricingProduct>;
  kits?: ReadonlyMap<string, PricingKit>;
}

export function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}
