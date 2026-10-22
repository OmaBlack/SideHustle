import {
  kobo,
  type Catalogue,
  type PricingKit,
  type PricingProduct,
  type ProductOption,
} from '@sidehustle/pricing';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { kitItems, kits, products, vendors, type StoredOption } from './schema/catalogue.js';

export function toPricingOption(o: StoredOption): ProductOption {
  if (o.type === 'check') return { type: 'check', id: o.id, label: o.label, addKobo: kobo(o.add_kobo) };
  return {
    type: 'select',
    id: o.id,
    label: o.label,
    values: o.values.map((v) => ({ value: v.value, addKobo: kobo(v.add_kobo) })),
  };
}

/**
 * Loads pricing inputs: sellable products, active kits, and every product an
 * active kit needs to be priced. A kit component that is archived, deleted or
 * from an unverified vendor gets stockQty 0, so the kit is unavailable
 * (FR-KIT-05) and a direct line is rejected as OUT_OF_STOCK (TRD checkout),
 * instead of pricing throwing UNKNOWN_PRODUCT. Drop-ship stock comes from
 * products.stock_qty (order reservations decrement it); hub stock is
 * `available` from hub_stock_levels, 0 when the hub has never received any.
 */
export async function loadPricingCatalogue(db: Database): Promise<Catalogue> {
  const krows = await db
    .select()
    .from(kits)
    .where(and(eq(kits.status, 'active'), isNull(kits.deletedAt)))
    .orderBy(asc(kits.sortOrder));
  const kitIds = krows.map((k) => k.id);
  const items = kitIds.length
    ? await db.select().from(kitItems).where(inArray(kitItems.kitId, kitIds)).orderBy(asc(kitItems.sort))
    : [];
  const componentIds = new Set(items.map((i) => i.productId));

  const prows = await db
    .select({ p: products, vendorStatus: vendors.status, vendorDeletedAt: vendors.deletedAt })
    .from(products)
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .where(
      componentIds.size
        ? or(isNull(products.deletedAt), inArray(products.id, [...componentIds]))
        : isNull(products.deletedAt),
    );

  const hubRows = await db.execute<{ product_id: string; available: number }>(
    sql`select product_id, available from hub_stock_levels`,
  );
  const hubAvailable = new Map(Array.from(hubRows, (r) => [r.product_id, Number(r.available)]));

  const ps = new Map<string, PricingProduct>();
  for (const { p, vendorStatus, vendorDeletedAt } of prows) {
    const sellable = p.status === 'active' && !p.deletedAt && vendorStatus === 'verified' && !vendorDeletedAt;
    if (!sellable && !componentIds.has(p.id)) continue;
    ps.set(p.id, {
      id: p.id,
      vendorId: p.vendorId,
      categoryId: p.categoryId,
      costKobo: kobo(p.costKobo),
      rrpKobo: kobo(p.rrpKobo),
      moq: p.moq,
      options: p.options.map(toPricingOption),
      stockQty: !sellable ? 0 : p.fulfilmentMode === 'hub' ? (hubAvailable.get(p.id) ?? 0) : p.stockQty,
    });
  }
  const ks = new Map<string, PricingKit>(
    krows.map((k) => [
      k.id,
      {
        id: k.id,
        priceKobo: kobo(k.priceKobo),
        sortOrder: k.sortOrder,
        platformFunded: k.platformFunded,
        items: items.filter((i) => i.kitId === k.id).map((i) => ({ productId: i.productId, qty: i.qty })),
      },
    ]),
  );
  return { products: ps, kits: ks };
}
