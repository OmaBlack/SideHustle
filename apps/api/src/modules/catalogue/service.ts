import { schema, type Database } from '@sidehustle/db';
import {
  bundleQuote,
  effectivePrice,
  freedomNumber,
  kitMetrics,
  kobo,
  liveDeals,
  margin,
  type PricingProduct,
} from '@sidehustle/pricing';
import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../../lib/db.js';
import type { StoredBundleItem } from '../../lib/pricing.js';
import { loadPricingContext, type PricingContext } from '../../lib/pricing.js';

type ProductRow = typeof schema.products.$inferSelect;
type VendorRow = typeof schema.vendors.$inferSelect;
type CategoryRow = typeof schema.categories.$inferSelect;

const sellable = and(
  eq(schema.products.status, 'active'),
  isNull(schema.products.deletedAt),
  eq(schema.vendors.status, 'verified'),
  isNull(schema.vendors.deletedAt),
);

export function vendorSummary(v: VendorRow) {
  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    location: v.location,
    color: v.brandColor,
    verified: v.status === 'verified',
    rating: v.rating ? Number(v.rating) : null,
    acceptsCustom: v.acceptsCustom,
    replyTimeText: v.replyTimeText,
  };
}

export function productView(p: ProductRow, v: VendorRow, c: CategoryRow, ctx: PricingContext) {
  const pp: PricingProduct = ctx.catalogue.products.get(p.id) ?? {
    id: p.id,
    vendorId: p.vendorId,
    categoryId: p.categoryId,
    costKobo: kobo(p.costKobo),
    rrpKobo: kobo(p.rrpKobo),
    moq: p.moq,
    stockQty: 0,
  };
  const price = effectivePrice(pp, ctx.deals, ctx.now);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    unit: p.unit,
    category: { id: c.id, slug: c.slug, name: c.name },
    vendor: vendorSummary(v),
    unitKobo: price.unitKobo,
    originalKobo: price.originalKobo,
    discountPct: price.discountPct,
    dealId: price.dealId ?? null,
    rrpKobo: p.rrpKobo,
    // FR-PROD-08: margin on the effective price.
    marginPct: margin(kobo(p.rrpKobo), price.unitKobo),
    moq: p.moq,
    leadTimeText: p.leadTimeText,
    customisable: p.options.length > 0,
    artKey: p.artKey,
    inStock: pp.stockQty == null || pp.stockQty >= p.moq,
    fulfilmentMode: p.fulfilmentMode,
  };
}

export async function listProducts(
  db: Database,
  f: { q?: string; category?: string; vendor?: string; sort?: 'price' | 'margin' | 'moq' },
  ctx?: PricingContext,
) {
  const c = ctx ?? (await loadPricingContext(db));
  const conds: (SQL | undefined)[] = [sellable];
  if (f.category) conds.push(eq(schema.categories.slug, f.category));
  if (f.vendor) conds.push(eq(schema.vendors.slug, f.vendor));
  if (f.q?.trim()) {
    // FR-SRCH-01: name, vendor name, vendor location, category name; case-insensitive.
    const like = `%${f.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(
        ilike(schema.products.name, like),
        ilike(schema.vendors.name, like),
        ilike(schema.vendors.location, like),
        ilike(schema.categories.name, like),
      ),
    );
  }
  const rows = await db
    .select({ p: schema.products, v: schema.vendors, c: schema.categories })
    .from(schema.products)
    .innerJoin(schema.vendors, eq(schema.vendors.id, schema.products.vendorId))
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(and(...conds))
    .orderBy(asc(schema.categories.sortOrder), asc(schema.products.name));
  const items = rows.map((r) => productView(r.p, r.v, r.c, c));
  if (f.sort === 'price') items.sort((a, b) => a.unitKobo - b.unitKobo);
  if (f.sort === 'margin') items.sort((a, b) => b.marginPct - a.marginPct);
  if (f.sort === 'moq') items.sort((a, b) => a.moq - b.moq);
  return items;
}

export async function categoriesWithCounts(db: Database) {
  const rows = await db
    .select({
      c: schema.categories,
      count: sql<number>`count(${schema.products.id}) filter (where ${sellable})`.mapWith(Number),
    })
    .from(schema.categories)
    .leftJoin(schema.products, eq(schema.products.categoryId, schema.categories.id))
    .leftJoin(schema.vendors, eq(schema.vendors.id, schema.products.vendorId))
    .groupBy(schema.categories.id)
    .orderBy(asc(schema.categories.sortOrder));
  return rows.map((r) => ({ id: r.c.id, slug: r.c.slug, name: r.c.name, productCount: r.count }));
}

export async function kitViews(db: Database, ctx: PricingContext, slug?: string) {
  const conds = [eq(schema.kits.status, 'active'), isNull(schema.kits.deletedAt)];
  if (slug) conds.push(eq(schema.kits.slug, slug));
  const rows = await db
    .select({ k: schema.kits, c: schema.categories })
    .from(schema.kits)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.kits.categoryId))
    .where(and(...conds))
    .orderBy(asc(schema.kits.sortOrder));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.k.id);
  const items = await db
    .select({ i: schema.kitItems, p: schema.products, v: schema.vendors })
    .from(schema.kitItems)
    .innerJoin(schema.products, eq(schema.products.id, schema.kitItems.productId))
    .innerJoin(schema.vendors, eq(schema.vendors.id, schema.products.vendorId))
    .where(inArray(schema.kitItems.kitId, ids))
    .orderBy(asc(schema.kitItems.sort));
  const extras = await db
    .select()
    .from(schema.kitExtras)
    .where(inArray(schema.kitExtras.kitId, ids))
    .orderBy(asc(schema.kitExtras.sort));
  return rows.flatMap(({ k, c }) => {
    const pk = ctx.catalogue.kits?.get(k.id);
    if (!pk) return [];
    const m = kitMetrics(pk, ctx.catalogue.products);
    return [
      {
        id: k.id,
        slug: k.slug,
        name: k.name,
        category: { id: c.id, slug: c.slug, name: c.name },
        priceKobo: m.priceKobo,
        costKobo: m.costKobo,
        retailKobo: m.retailKobo,
        profitKobo: m.profitKobo,
        marginPct: m.marginPct,
        units: m.units,
        productCount: m.productCount,
        available: m.available,
        tip: k.tip,
        items: items
          .filter((i) => i.i.kitId === k.id)
          .map((i) => ({
            productId: i.p.id,
            slug: i.p.slug,
            name: i.p.name,
            unit: i.p.unit,
            qty: i.i.qty,
            rrpKobo: i.p.rrpKobo,
            artKey: i.p.artKey,
            vendor: { name: i.v.name, slug: i.v.slug },
          })),
        extras: extras.filter((e) => e.kitId === k.id).map((e) => e.label),
      },
    ];
  });
}

export async function goalRows(db: Database, goalKobo: number) {
  const ctx = await loadPricingContext(db);
  const kits = await kitViews(db, ctx);
  const rows = freedomNumber(
    kobo(goalKobo),
    kits.map((k) => ({
      kitId: k.id,
      priceKobo: kobo(k.priceKobo),
      profitKobo: kobo(k.profitKobo),
      sortOrder: ctx.catalogue.kits!.get(k.id)!.sortOrder,
      available: k.available,
    })),
  );
  const byId = new Map(kits.map((k) => [k.id, k]));
  return rows.map((r) => {
    const k = byId.get(r.kitId)!;
    return {
      kitId: k.id,
      slug: k.slug,
      name: k.name,
      kitsPerMonth: r.kitsPerMonth,
      priceKobo: r.priceKobo,
      profitKobo: k.profitKobo,
    };
  });
}

export async function liveDealViews(db: Database, ctx: PricingContext) {
  const live = liveDeals(ctx.deals, ctx.now);
  if (!live.length) return [];
  const rows = await db
    .select({ d: schema.deals, v: schema.vendors, c: schema.categories, p: schema.products })
    .from(schema.deals)
    .innerJoin(schema.vendors, eq(schema.vendors.id, schema.deals.vendorId))
    .innerJoin(schema.categories, eq(schema.categories.id, schema.deals.categoryId))
    .leftJoin(schema.products, eq(schema.products.id, schema.deals.productId))
    .where(
      and(
        inArray(
          schema.deals.id,
          live.map((d) => d.id),
        ),
        eq(schema.vendors.status, 'verified'),
      ),
    );
  const order = new Map(live.map((d, i) => [d.id, i]));
  return rows
    .sort((a, b) => order.get(a.d.id)! - order.get(b.d.id)!)
    .map(({ d, v, c, p }) => dealView(d, v, c, p));
}

export function dealView(
  d: typeof schema.deals.$inferSelect,
  v: VendorRow,
  c: CategoryRow,
  p: ProductRow | null,
) {
  return {
    id: d.id,
    kind: d.kind,
    scope: d.scope,
    headline: d.headline,
    detail: d.detail,
    discountPct: d.discountPct,
    endsOn: d.endsOn,
    vendor: { id: v.id, slug: v.slug, name: v.name, color: v.brandColor },
    category: { slug: c.slug, name: c.name },
    product: p ? { id: p.id, slug: p.slug, name: p.name } : null,
    moderationStatus: d.moderationStatus,
  };
}

export function bundleView(items: readonly StoredBundleItem[], ctx: PricingContext) {
  return bundleQuote(items, ctx.catalogue.products, ctx.deals, ctx.bundleRules, ctx.now);
}

export async function appConfigValue<T>(db: Tx, key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(schema.appConfig).where(eq(schema.appConfig.key, key));
  return (row?.value as T | undefined) ?? fallback;
}
