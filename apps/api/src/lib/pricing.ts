import { loadPricingCatalogue, schema } from '@sidehustle/db';
import {
  kobo,
  type BundleRule,
  type CartLine,
  type Catalogue,
  type Deal,
  type OptionSelection,
} from '@sidehustle/pricing';
import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from './db.js';

export interface PricingContext {
  catalogue: Catalogue;
  deals: Deal[];
  bundleRules: BundleRule[];
  now: Date;
}

/** Approved, unremoved deals as pricing inputs. Liveness (dates, headline) is decided by the pricing package. */
export async function loadDeals(db: Tx): Promise<Deal[]> {
  const rows = await db
    .select()
    .from(schema.deals)
    .where(
      and(
        eq(schema.deals.moderationStatus, 'approved'),
        isNull(schema.deals.deletedAt),
        isNull(schema.deals.endedAt),
      ),
    );
  return rows.map((d) => ({
    id: d.id,
    vendorId: d.vendorId,
    kind: d.kind,
    scope: d.scope,
    productId: d.productId,
    categoryId: d.categoryId,
    discountPct: d.discountPct,
    headline: d.headline,
    startsAt: d.startsAt,
    endsOn: d.endsOn,
    createdAt: d.createdAt,
  }));
}

export async function loadBundleRules(db: Tx): Promise<BundleRule[]> {
  const rows = await db.select().from(schema.bundleRules);
  return rows.map((r) => ({ scope: r.scope, scopeId: r.scopeId, minKobo: kobo(r.minKobo), pct: r.pct }));
}

/** Everything the server needs to price authoritatively (SRS 2.4). Loaded per request; the catalogue is small. */
export async function loadPricingContext(db: Tx, now = new Date()): Promise<PricingContext> {
  const [catalogue, deals, bundleRules] = await Promise.all([
    loadPricingCatalogue(db as never),
    loadDeals(db),
    loadBundleRules(db),
  ]);
  return { catalogue, deals, bundleRules, now };
}

export type StoredCartLine = typeof schema.cartLines.$inferSelect;

export interface StoredBundleItem {
  productId: string;
  qty: number;
  selection?: OptionSelection;
  note?: string;
}

export function toPricingLine(l: StoredCartLine): CartLine {
  if (l.lineType === 'product') {
    return {
      kind: 'product',
      productId: l.productId!,
      qty: l.qty,
      ...(l.options ? { selection: l.options as OptionSelection } : {}),
      ...(l.note ? { note: l.note } : {}),
    };
  }
  if (l.lineType === 'kit') return { kind: 'kit', kitId: l.kitId!, qty: l.qty };
  return {
    kind: 'bundle',
    ...(l.name ? { name: l.name } : {}),
    items: (l.items as StoredBundleItem[]) ?? [],
    qty: l.qty,
  };
}
