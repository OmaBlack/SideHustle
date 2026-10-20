import {
  kobo,
  type Catalogue,
  type PricingKit,
  type PricingProduct,
  type ProductOption,
} from '@sidehustle/pricing';
import { asc, eq, isNull } from 'drizzle-orm';
import type { Database } from './client.js';
import { kitItems, kits, products, type StoredOption } from './schema/catalogue.js';

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
 * Loads active products and kits as pricing inputs. Drop-ship stock comes from
 * products.stock_qty; hub stock will join hub_stock_levels once ticket 3.9 lands.
 */
export async function loadPricingCatalogue(db: Database): Promise<Catalogue> {
  const prows = await db.select().from(products).where(isNull(products.deletedAt));
  const ps = new Map<string, PricingProduct>(
    prows
      .filter((p) => p.status === 'active')
      .map((p) => [
        p.id,
        {
          id: p.id,
          vendorId: p.vendorId,
          categoryId: p.categoryId,
          costKobo: kobo(p.costKobo),
          rrpKobo: kobo(p.rrpKobo),
          moq: p.moq,
          options: p.options.map(toPricingOption),
          stockQty: p.stockQty,
        },
      ]),
  );
  const krows = await db.select().from(kits).where(eq(kits.status, 'active')).orderBy(asc(kits.sortOrder));
  const items = await db.select().from(kitItems).orderBy(asc(kitItems.sort));
  const ks = new Map<string, PricingKit>(
    krows
      .filter((k) => !k.deletedAt)
      .map((k) => [
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
