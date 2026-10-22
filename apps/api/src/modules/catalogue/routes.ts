import { schema } from '@sidehustle/db';
import { effectivePrice, kobo, margin, optionAddOn, validateQty } from '@sidehustle/pricing';
import { BundleQuoteInput, ProductQuoteInput } from '@sidehustle/schemas';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadPricingContext } from '../../lib/pricing.js';
import { notFound } from '../../lib/problems.js';
import {
  appConfigValue,
  bundleView,
  categoriesWithCounts,
  goalRows,
  kitViews,
  listProducts,
  liveDealViews,
  productView,
  vendorSummary,
} from './service.js';

const Slug = z.object({ slug: z.string().min(1).max(80) });
const GOALS = [50_000_00, 100_000_00, 250_000_00, 500_000_00];

export const catalogueRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;

  app.get('/categories', { schema: { tags: ['catalogue'] } }, async () => ({
    categories: await categoriesWithCounts(db),
  }));

  app.get(
    '/products',
    {
      schema: {
        tags: ['catalogue'],
        querystring: z.object({
          q: z.string().max(100).optional(),
          category: z.string().max(40).optional(),
          vendor: z.string().max(80).optional(),
          sort: z.enum(['price', 'margin', 'moq']).optional(),
        }),
      },
    },
    async (req) => ({ products: await listProducts(db, req.query) }),
  );

  app.get('/products/:slug', { schema: { tags: ['catalogue'], params: Slug } }, async (req) => {
    const [row] = await db
      .select({ p: schema.products, v: schema.vendors, c: schema.categories })
      .from(schema.products)
      .innerJoin(schema.vendors, eq(schema.vendors.id, schema.products.vendorId))
      .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
      .where(
        and(
          eq(schema.products.slug, req.params.slug),
          eq(schema.products.status, 'active'),
          isNull(schema.products.deletedAt),
          eq(schema.vendors.status, 'verified'),
        ),
      );
    if (!row) throw notFound('Product not found');
    const ctx = await loadPricingContext(db);
    return {
      product: {
        ...productView(row.p, row.v, row.c, ctx),
        note: row.p.note,
        notePlaceholder: row.p.notePlaceholder,
        options: row.p.options,
        vendor: {
          ...vendorSummary(row.v),
          leadTimeText: row.v.leadTimeText,
          customNote: row.v.customNote,
          ordersCount: row.v.ordersCount,
        },
      },
    };
  });

  // Product page calculator (plan section 6): unit price with options for a quantity.
  app.post(
    '/products/:id/quote',
    { schema: { tags: ['catalogue'], params: z.object({ id: z.string().uuid() }), body: ProductQuoteInput } },
    async (req) => {
      const ctx = await loadPricingContext(db);
      const p = ctx.catalogue.products.get(req.params.id);
      if (!p) throw notFound('Product not found');
      const price = effectivePrice(p, ctx.deals, ctx.now);
      const opt = optionAddOn(p, req.body.selection, req.body.note);
      const unit = kobo(price.unitKobo + opt.addKobo);
      const q = validateQty(p, req.body.qty);
      return {
        unitKobo: unit,
        originalUnitKobo: price.originalKobo + opt.addKobo,
        discountPct: price.discountPct,
        addOnKobo: opt.addKobo,
        optionText: opt.text,
        isCustom: opt.isCustom,
        qty: req.body.qty,
        totalKobo: unit * req.body.qty,
        marginPct: margin(p.rrpKobo, unit),
        ...(q.ok ? {} : { minQty: q.minQty }),
      };
    },
  );

  app.get('/vendors', { schema: { tags: ['catalogue'] } }, async () => {
    const rows = await db
      .select({
        v: schema.vendors,
        productCount:
          sql<number>`count(${schema.products.id}) filter (where ${schema.products.status} = 'active' and ${schema.products.deletedAt} is null)`.mapWith(
            Number,
          ),
      })
      .from(schema.vendors)
      .leftJoin(schema.products, eq(schema.products.vendorId, schema.vendors.id))
      .where(and(eq(schema.vendors.status, 'verified'), isNull(schema.vendors.deletedAt)))
      .groupBy(schema.vendors.id)
      .orderBy(asc(schema.vendors.name));
    return {
      vendors: rows.map((r) => ({
        ...vendorSummary(r.v),
        featured: r.v.featured,
        productCount: r.productCount,
      })),
    };
  });

  app.get('/vendors/:slug', { schema: { tags: ['catalogue'], params: Slug } }, async (req) => {
    const [v] = await db
      .select()
      .from(schema.vendors)
      .where(
        and(
          eq(schema.vendors.slug, req.params.slug),
          eq(schema.vendors.status, 'verified'),
          isNull(schema.vendors.deletedAt),
        ),
      );
    if (!v) throw notFound('Vendor not found');
    const products = await listProducts(db, { vendor: v.slug });
    return {
      vendor: {
        ...vendorSummary(v),
        about: v.about,
        about2: v.about2,
        tags: v.tags,
        sinceYear: v.sinceYear,
        leadTimeText: v.leadTimeText,
        shipsTo: v.shipsTo,
        ordersCount: v.ordersCount,
        originNote: v.originNote,
        customNote: v.customNote,
        productCount: products.length,
      },
      products,
    };
  });

  app.get('/kits', { schema: { tags: ['catalogue'] } }, async () => {
    const ctx = await loadPricingContext(db);
    return { kits: await kitViews(db, ctx) };
  });

  app.get(
    '/kits/goal',
    {
      schema: { tags: ['catalogue'], querystring: z.object({ amount: z.coerce.number().int().positive() }) },
    },
    async (req) => ({
      goals: GOALS,
      amountKobo: req.query.amount,
      rows: await goalRows(db, req.query.amount),
    }),
  );

  app.get('/kits/:slug', { schema: { tags: ['catalogue'], params: Slug } }, async (req) => {
    const ctx = await loadPricingContext(db);
    const [kit] = await kitViews(db, ctx, req.params.slug);
    if (!kit) throw notFound('Kit not found');
    return { kit };
  });

  app.get('/deals/live', { schema: { tags: ['catalogue'] } }, async () => {
    const ctx = await loadPricingContext(db);
    return { deals: await liveDealViews(db, ctx) };
  });

  // FR-HOME-01: up to 4 slides, house slides plus up to 2 live deals; sizes from app_config.
  app.get('/slides', { schema: { tags: ['catalogue'] } }, async () => {
    const ctx = await loadPricingContext(db);
    const max = await appConfigValue(db, 'slideshow_max_slides', 4);
    const maxDeals = await appConfigValue(db, 'slideshow_max_deals', 2);
    const deals = (await liveDealViews(db, ctx)).slice(0, maxDeals);
    const house = ['start', 'build', 'vendor', 'goal'].map((key) => ({ type: 'house' as const, key }));
    const slides = [
      ...house.slice(0, 1),
      ...deals.map((deal) => ({ type: 'deal' as const, key: deal.id, deal })),
      ...house.slice(1),
    ].slice(0, max);
    return { slides };
  });

  app.post('/bundles/quote', { schema: { tags: ['catalogue'], body: BundleQuoteInput } }, async (req) => {
    const ctx = await loadPricingContext(db);
    if (!req.body.items.length) {
      return {
        quote: {
          costKobo: 0,
          discountKobo: 0,
          payKobo: 0,
          retailKobo: 0,
          profitKobo: 0,
          marginPct: 0,
          units: 0,
          vendorCount: 0,
          lines: [],
          issues: [],
        },
        rules: ctx.bundleRules,
      };
    }
    return { quote: bundleView(req.body.items, ctx), rules: ctx.bundleRules };
  });

  app.get('/delivery-methods', { schema: { tags: ['checkout'] } }, async () => {
    const rows = await db
      .select()
      .from(schema.deliveryMethods)
      .where(eq(schema.deliveryMethods.active, true))
      .orderBy(asc(schema.deliveryMethods.sortOrder));
    return {
      methods: rows.map((m) => ({
        code: m.code,
        name: m.name,
        feeKobo: m.feeKobo,
        etaText: m.etaText,
        eligibleStates: m.eligibleStates,
        needsAddress: m.code !== 'pickup',
      })),
    };
  });
};
