import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, kobo, timestamps, tstz } from './_shared.js';
import { kits, products, vendors } from './catalogue.js';
import {
  customRequestStatus,
  fulfilmentKind,
  fulfilmentStatus,
  fundedBy,
  ledgerAccount,
  ledgerJournalKind,
  lineType,
  orderStatus,
  paymentProvider,
  paymentStatus,
  payoutStatus,
  refundStatus,
  reservationSource,
  reservationStatus,
} from './enums.js';
import { users } from './identity.js';

const nonneg = (name: string, col: AnyPgColumn) => check(name, sql`${col} >= 0`);

export const customRequests = pgTable('custom_requests', {
  id: id(),
  vendorId: uuid()
    .notNull()
    .references(() => vendors.id),
  buyerId: uuid()
    .notNull()
    .references(() => users.id),
  projectType: text().notNull(),
  brief: text().notNull(),
  quantityEstimate: integer(),
  status: customRequestStatus().notNull().default('new'),
  quotedAmountKobo: kobo(),
  quoteExpiresAt: tstz(),
  vendorReply: text(),
  /** Set when an admin removes the request for breaking content rules (FR-ADM-02). */
  hiddenAt: tstz(),
  hiddenReason: text(),
  ...timestamps,
});

/** Builder drafts saved to an account. items: [{ product_id, qty, options, note }] */
export const savedBundles = pgTable('saved_bundles', {
  id: id(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  items: jsonb().notNull(),
  ...timestamps,
});

export const carts = pgTable(
  'carts',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('carts_user_key').on(t.userId)],
);

export const cartLines = pgTable(
  'cart_lines',
  {
    id: id(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    lineType: lineType().notNull(),
    productId: uuid().references(() => products.id),
    kitId: uuid().references(() => kits.id),
    qty: integer().notNull(),
    options: jsonb(),
    note: text(),
    name: text(),
    /** Bundle items: [{ product_id, qty, options, note }] */
    items: jsonb(),
    /** Unit price and availability the buyer last saw, so the cart can flag changes (FR-CART-05). */
    seenUnitKobo: kobo(),
    seenAvailable: boolean(),
    ...timestamps,
  },
  (t) => [
    index('cart_lines_cart_idx').on(t.cartId),
    check('cart_lines_qty_positive', sql`${t.qty} >= 1`),
    check(
      'cart_lines_ref',
      sql`(${t.lineType} = 'product' AND ${t.productId} IS NOT NULL AND ${t.kitId} IS NULL)
       OR (${t.lineType} = 'kit' AND ${t.kitId} IS NOT NULL AND ${t.productId} IS NULL)
       OR (${t.lineType} = 'bundle' AND ${t.items} IS NOT NULL AND ${t.productId} IS NULL AND ${t.kitId} IS NULL)`,
    ),
  ],
);

/** 15-minute server-only quote that order creation must reference (TRD §6.6). */
export const checkoutQuotes = pgTable(
  'checkout_quotes',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    payload: jsonb().notNull(),
    totalKobo: kobo().notNull(),
    expiresAt: tstz().notNull(),
    ...timestamps,
  },
  (t) => [
    index('checkout_quotes_user_idx').on(t.userId),
    nonneg('checkout_quotes_total_nonneg', t.totalKobo),
  ],
);

/** Replay-safe POSTs (TRD §8.2). Postgres only. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    requestHash: text().notNull(),
    responseStatus: smallint(),
    response: jsonb(),
    expiresAt: tstz().notNull(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('idempotency_keys_user_key').on(t.userId, t.key)],
);

export const orders = pgTable(
  'orders',
  {
    id: id(),
    /** SH- + 8 Crockford base32 chars (BR-11). */
    ref: text().notNull(),
    buyerId: uuid()
      .notNull()
      .references(() => users.id),
    /** A quote creates at most one order (FR-CHK-07). */
    quoteId: uuid()
      .notNull()
      .references(() => checkoutQuotes.id),
    subtotalKobo: kobo().notNull(),
    discountKobo: kobo().notNull().default(0),
    deliveryFeeKobo: kobo().notNull().default(0),
    totalKobo: kobo().notNull(),
    deliveryMethod: text().notNull(),
    address: jsonb(),
    recipient: text().notNull(),
    phone: text().notNull(),
    status: orderStatus().notNull().default('pending_payment'),
    expiresAt: tstz().notNull(),
    paidAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('orders_ref_key').on(t.ref),
    uniqueIndex('orders_quote_key').on(t.quoteId),
    index('orders_buyer_idx').on(t.buyerId),
    index('orders_status_idx').on(t.status),
    nonneg('orders_subtotal_nonneg', t.subtotalKobo),
    nonneg('orders_discount_nonneg', t.discountKobo),
    nonneg('orders_delivery_nonneg', t.deliveryFeeKobo),
    nonneg('orders_total_nonneg', t.totalKobo),
    check(
      'orders_total_matches',
      sql`${t.totalKobo} = ${t.subtotalKobo} - ${t.discountKobo} + ${t.deliveryFeeKobo}`,
    ),
  ],
);

/** One per vendor drop-ship group plus one hub group per order (replaces TRD vendor_orders). */
export const fulfilments = pgTable(
  'fulfilments',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    kind: fulfilmentKind().notNull(),
    vendorId: uuid().references(() => vendors.id),
    status: fulfilmentStatus().notNull().default('awaiting_confirmation'),
    confirmedAt: tstz(),
    rejectedAt: tstz(),
    rejectReason: text(),
    dispatchedAt: tstz(),
    trackingRef: text(),
    deliveredAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index('fulfilments_order_idx').on(t.orderId),
    index('fulfilments_vendor_idx').on(t.vendorId),
    check('fulfilments_kind_vendor', sql`(${t.kind} = 'vendor') = (${t.vendorId} IS NOT NULL)`),
  ],
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    /** Kit and bundle lines get one child line per component. */
    parentLineId: uuid().references((): AnyPgColumn => orderLines.id),
    fulfilmentId: uuid().references(() => fulfilments.id),
    vendorId: uuid().references(() => vendors.id),
    lineType: lineType().notNull(),
    productId: uuid().references(() => products.id),
    kitId: uuid().references(() => kits.id),
    bundleId: uuid(),
    nameSnapshot: text().notNull(),
    unitPriceKobo: kobo().notNull(),
    qty: integer().notNull(),
    /** This line's share of a bundle discount or kit price gap, split by largest remainder (rule 8). */
    discountKobo: kobo().notNull().default(0),
    /** Who absorbs discountKobo (plan section 8a): vendors for kit gaps by default, the platform for bundles. */
    discountFundedBy: fundedBy(),
    optionsSnapshot: jsonb(),
    note: text(),
    ...timestamps,
  },
  (t) => [
    index('order_lines_order_idx').on(t.orderId),
    nonneg('order_lines_unit_nonneg', t.unitPriceKobo),
    nonneg('order_lines_discount_nonneg', t.discountKobo),
    check('order_lines_qty_positive', sql`${t.qty} >= 1`),
  ],
);

export const stockReservations = pgTable(
  'stock_reservations',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    source: reservationSource().notNull(),
    qty: integer().notNull(),
    status: reservationStatus().notNull().default('active'),
    expiresAt: tstz().notNull(),
    ...timestamps,
  },
  (t) => [
    index('stock_reservations_order_idx').on(t.orderId),
    index('stock_reservations_active_idx')
      .on(t.productId)
      .where(sql`${t.status} = 'active'`),
    check('stock_reservations_qty_positive', sql`${t.qty} >= 1`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    provider: paymentProvider().notNull(),
    providerRef: text().notNull(),
    amountKobo: kobo().notNull(),
    currency: text().notNull().default('NGN'),
    channel: text(),
    status: paymentStatus().notNull().default('pending'),
    rawPayload: jsonb(),
    paidAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('payments_provider_ref_key').on(t.provider, t.providerRef),
    index('payments_order_idx').on(t.orderId),
    nonneg('payments_amount_nonneg', t.amountKobo),
  ],
);

export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id),
    /** Null for a full-order refund. */
    fulfilmentId: uuid().references(() => fulfilments.id),
    amountKobo: kobo().notNull(),
    reason: text().notNull(),
    status: refundStatus().notNull().default('pending'),
    providerRef: text(),
    actorId: uuid().references(() => users.id),
    ...timestamps,
  },
  (t) => [check('refunds_amount_positive', sql`${t.amountKobo} > 0`)],
);

/** Double-entry, append-only (TRD §7.3). Every journal's entries sum to zero (deferred trigger in migration 0002). */
export const ledgerJournals = pgTable(
  'ledger_journals',
  {
    id: id(),
    orderId: uuid().references(() => orders.id),
    kind: ledgerJournalKind().notNull(),
    memo: text(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index('ledger_journals_order_idx').on(t.orderId)],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    journalId: uuid()
      .notNull()
      .references(() => ledgerJournals.id),
    account: ledgerAccount().notNull(),
    vendorId: uuid().references(() => vendors.id),
    /** Signed. */
    amountKobo: kobo().notNull(),
    fundedBy: fundedBy(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('ledger_entries_journal_idx').on(t.journalId),
    index('ledger_entries_vendor_idx').on(t.vendorId),
  ],
);

export const payoutSettings = pgTable(
  'payout_settings',
  {
    id: id(),
    /** Null = platform default. */
    vendorId: uuid().references(() => vendors.id),
    daysAfterDelivery: integer().notNull(),
    holdbackBps: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique('payout_settings_vendor_key').on(t.vendorId).nullsNotDistinct(),
    check('payout_settings_holdback', sql`${t.holdbackBps} BETWEEN 0 AND 10000`),
  ],
);

export const payouts = pgTable(
  'payouts',
  {
    id: id(),
    vendorId: uuid()
      .notNull()
      .references(() => vendors.id),
    amountKobo: kobo().notNull(),
    status: payoutStatus().notNull().default('pending'),
    periodStart: tstz().notNull(),
    periodEnd: tstz().notNull(),
    providerRef: text(),
    ...timestamps,
  },
  (t) => [nonneg('payouts_amount_nonneg', t.amountKobo)],
);

export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    orderLineId: uuid()
      .notNull()
      .references(() => orderLines.id),
    buyerId: uuid()
      .notNull()
      .references(() => users.id),
    vendorId: uuid()
      .notNull()
      .references(() => vendors.id),
    rating: smallint().notNull(),
    text: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('reviews_line_key').on(t.orderLineId),
    check('reviews_rating', sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);
