import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, kobo, softDelete, timestamps, tstz } from './_shared.js';
import {
  dealKind,
  dealScope,
  fulfilmentMode,
  hubMovementKind,
  kycStatus,
  licenceStatus,
  moderationStatus,
  recordStatus,
  ruleScope,
  vendorStaffRole,
  vendorStatus,
} from './enums.js';
import { users } from './identity.js';

/** Stored option shapes (plan section 3). Money in kobo. */
export type StoredOption =
  | { type: 'check'; id: string; label: string; add_kobo: number }
  | { type: 'select'; id: string; label: string; values: { value: string; add_kobo: number }[] };

export const categories = pgTable(
  'categories',
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    iconKey: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('categories_slug_key').on(t.slug)],
);

export const vendors = pgTable(
  'vendors',
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    location: text().notNull(),
    originNote: text(),
    sinceYear: smallint(),
    leadTimeText: text(),
    shipsTo: text(),
    about: text(),
    about2: text(),
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    acceptsCustom: boolean().notNull().default(false),
    customNote: text(),
    featured: boolean().notNull().default(false),
    replyTimeText: text(),
    /** Display stats carried over from the prototype until real reviews and orders exist. */
    rating: numeric({ precision: 2, scale: 1 }),
    ordersCount: integer().notNull().default(0),
    status: vendorStatus().notNull().default('pending'),
    brandColor: text(),
    kycStatus: kycStatus().notNull().default('not_started'),
    verifiedAt: tstz(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex('vendors_slug_key').on(t.slug)],
);

export const vendorStaff = pgTable(
  'vendor_staff',
  {
    vendorId: uuid()
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: vendorStaffRole().notNull().default('staff'),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.vendorId, t.userId] })],
);

/** Licence documents, e.g. PCN for paracetamol (FR-ADM-08). */
export const vendorLicences = pgTable('vendor_licences', {
  id: id(),
  vendorId: uuid()
    .notNull()
    .references(() => vendors.id, { onDelete: 'cascade' }),
  licenceType: text().notNull(),
  documentKey: text().notNull(),
  expiresAt: tstz(),
  status: licenceStatus().notNull().default('pending'),
  ...timestamps,
});

export const products = pgTable(
  'products',
  {
    id: id(),
    slug: text().notNull(),
    vendorId: uuid()
      .notNull()
      .references(() => vendors.id),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    name: text().notNull(),
    unit: text().notNull(),
    costKobo: kobo().notNull(),
    rrpKobo: kobo().notNull(),
    moq: integer().notNull().default(1),
    leadTimeText: text(),
    note: text(),
    notePlaceholder: text(),
    /** Fallback inline SVG shape key until photos exist. */
    artKey: text(),
    status: recordStatus().notNull().default('active'),
    fulfilmentMode: fulfilmentMode().notNull().default('drop_ship'),
    /** Drop-ship stock declared by the vendor; null = not tracked. Hub stock lives in hub_stock_movements. */
    stockQty: integer(),
    options: jsonb()
      .$type<StoredOption[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    searchText: text(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex('products_slug_key').on(t.slug),
    index('products_vendor_idx').on(t.vendorId),
    index('products_category_idx').on(t.categoryId),
    check('products_cost_nonneg', sql`${t.costKobo} >= 0`),
    check('products_rrp_nonneg', sql`${t.rrpKobo} >= 0`),
    check('products_moq_positive', sql`${t.moq} >= 1`),
    check('products_stock_nonneg', sql`${t.stockQty} IS NULL OR ${t.stockQty} >= 0`),
  ],
);

export const productImages = pgTable('product_images', {
  id: id(),
  productId: uuid()
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  url: text().notNull(),
  alt: text(),
  sort: integer().notNull().default(0),
  ...timestamps,
});

/** Categories or single products that need a licence before they can be listed (FR-ADM-08). */
export const restrictedItems = pgTable(
  'restricted_items',
  {
    id: id(),
    categoryId: uuid().references(() => categories.id),
    productId: uuid().references(() => products.id),
    requiredLicence: text().notNull(),
    ...timestamps,
  },
  (t) => [check('restricted_items_target', sql`(${t.categoryId} IS NULL) <> (${t.productId} IS NULL)`)],
);

export const kits = pgTable(
  'kits',
  {
    id: id(),
    slug: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    name: text().notNull(),
    priceKobo: kobo().notNull(),
    tip: text(),
    status: recordStatus().notNull().default('active'),
    /** Final tie-break for the freedom number and listings (FR-GOAL-03). */
    sortOrder: integer().notNull(),
    /** Section 8a: true when the platform, not the component vendors, absorbs the price gap. */
    platformFunded: boolean().notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex('kits_slug_key').on(t.slug), check('kits_price_nonneg', sql`${t.priceKobo} >= 0`)],
);

export const kitItems = pgTable(
  'kit_items',
  {
    kitId: uuid()
      .notNull()
      .references(() => kits.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    qty: integer().notNull(),
    sort: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.kitId, t.productId] }),
    check('kit_items_qty_positive', sql`${t.qty} >= 1`),
  ],
);

export const kitExtras = pgTable('kit_extras', {
  id: id(),
  kitId: uuid()
    .notNull()
    .references(() => kits.id, { onDelete: 'cascade' }),
  label: text().notNull(),
  sort: integer().notNull().default(0),
});

export const deals = pgTable(
  'deals',
  {
    id: id(),
    vendorId: uuid()
      .notNull()
      .references(() => vendors.id),
    kind: dealKind().notNull(),
    scope: dealScope().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    productId: uuid().references(() => products.id),
    discountPct: smallint().notNull().default(0),
    headline: text().notNull(),
    detail: text(),
    startsAt: tstz(),
    /** Last live day as an Africa/Lagos calendar date; null allowed for launches only [Default]. */
    endsOn: date(),
    moderationStatus: moderationStatus().notNull().default('pending'),
    endedAt: tstz(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index('deals_vendor_idx').on(t.vendorId),
    check(
      'deals_kind_discount',
      sql`(${t.kind} = 'launch' AND ${t.discountPct} = 0) OR (${t.kind} = 'promo' AND ${t.discountPct} BETWEEN 1 AND 90)`,
    ),
    check('deals_scope_product', sql`(${t.scope} = 'product') = (${t.productId} IS NOT NULL)`),
    check('deals_headline_length', sql`char_length(${t.headline}) <= 60`),
    check('deals_promo_end', sql`${t.kind} = 'launch' OR ${t.endsOn} IS NOT NULL`),
  ],
);

/** One row per hub product. It is the row locked during reservation; quantities derive from movements. */
export const hubStock = pgTable('hub_stock', {
  productId: uuid()
    .primaryKey()
    .references(() => products.id),
  lowStockThreshold: integer().notNull().default(0),
  ...timestamps,
});

/**
 * Append-only, signed qty. on_hand = Σ receipt + adjustment + dispatch; available = Σ all kinds.
 * A reservation is negative and a release positive; dispatching reserved stock writes a release and a
 * negative dispatch together, so the units leave on_hand once and available once (view hub_stock_levels).
 */
export const hubStockMovements = pgTable(
  'hub_stock_movements',
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => hubStock.productId),
    kind: hubMovementKind().notNull(),
    qty: integer().notNull(),
    orderId: uuid(),
    actorId: uuid().references(() => users.id),
    reason: text(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index('hub_stock_movements_product_idx').on(t.productId)],
);

export const bundleRules = pgTable(
  'bundle_rules',
  {
    id: id(),
    scope: ruleScope().notNull(),
    scopeId: uuid(),
    minKobo: kobo().notNull(),
    pct: smallint().notNull(),
    ...timestamps,
  },
  (t) => [
    unique('bundle_rules_scope_key').on(t.scope, t.scopeId).nullsNotDistinct(),
    check('bundle_rules_scope_id', sql`(${t.scope} = 'global') = (${t.scopeId} IS NULL)`),
    check('bundle_rules_min_nonneg', sql`${t.minKobo} >= 0`),
    check('bundle_rules_pct', sql`${t.pct} BETWEEN 0 AND 90`),
  ],
);

export const commissionRules = pgTable(
  'commission_rules',
  {
    id: id(),
    scope: ruleScope().notNull(),
    scopeId: uuid(),
    /** Basis points, so 7.5% = 750. */
    rateBps: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    unique('commission_rules_scope_key').on(t.scope, t.scopeId).nullsNotDistinct(),
    check('commission_rules_scope_id', sql`(${t.scope} = 'global') = (${t.scopeId} IS NULL)`),
    check('commission_rules_rate', sql`${t.rateBps} BETWEEN 0 AND 10000`),
  ],
);

export const deliveryMethods = pgTable(
  'delivery_methods',
  {
    id: id(),
    code: text().notNull(),
    name: text().notNull(),
    feeKobo: kobo().notNull(),
    etaText: text(),
    /** Empty = every state. */
    eligibleStates: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    partner: text(),
    rateCard: jsonb(),
    active: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('delivery_methods_code_key').on(t.code),
    check('delivery_methods_fee_nonneg', sql`${t.feeKobo} >= 0`),
  ],
);
