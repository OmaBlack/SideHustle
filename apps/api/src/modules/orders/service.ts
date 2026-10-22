import { schema, type Database } from '@sidehustle/db';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Tx } from '../../lib/db.js';
import { enqueue } from '../../lib/outbox.js';
import { conflict } from '../../lib/problems.js';

type FulfilmentStatus = (typeof schema.fulfilments.$inferSelect)['status'];
type OrderStatus = (typeof schema.orders.$inferSelect)['status'];

/** Plan section 7: allowed fulfilment transitions. */
const FULFILMENT: Record<string, Partial<Record<FulfilmentStatus, FulfilmentStatus>>> = {
  confirm: { awaiting_confirmation: 'confirmed' },
  reject: { awaiting_confirmation: 'rejected' },
  dispatch: { confirmed: 'dispatched' },
  deliver: { dispatched: 'delivered' },
};
export type FulfilmentEvent = keyof typeof FULFILMENT;

export function nextFulfilmentStatus(
  from: FulfilmentStatus,
  event: FulfilmentEvent,
): FulfilmentStatus | null {
  return FULFILMENT[event]?.[from] ?? null;
}

/**
 * After payment the parent status is derived from its fulfilments, ignoring
 * rejected ones: all remaining delivered → delivered; any confirmed or later →
 * in fulfilment; none left → cancelled; otherwise still paid.
 */
export function deriveOrderStatus(current: OrderStatus, statuses: FulfilmentStatus[]): OrderStatus {
  if (!['paid', 'in_fulfilment', 'delivered'].includes(current)) return current;
  const live = statuses.filter((s) => s !== 'rejected');
  if (!live.length) return 'cancelled';
  if (live.every((s) => s === 'delivered')) return 'delivered';
  if (live.some((s) => s !== 'awaiting_confirmation')) return 'in_fulfilment';
  return 'paid';
}

/** Four buyer-facing steps done (FR-ORD-02): Paid, Confirmed by vendor, Dispatched, Delivered. */
export function stepsDone(f: FulfilmentStatus): number {
  return { awaiting_confirmation: 1, confirmed: 2, dispatched: 3, delivered: 4, rejected: 0 }[f];
}

/** What the buyer paid for a fulfilment's leaf lines, after their discount shares (BR-09, rule 8). */
export async function fulfilmentAmount(tx: Tx, fulfilmentId: string): Promise<number> {
  const [r] = await tx
    .select({
      amount:
        sql<number>`coalesce(sum(${schema.orderLines.unitPriceKobo} * ${schema.orderLines.qty} - ${schema.orderLines.discountKobo}), 0)`.mapWith(
          Number,
        ),
    })
    .from(schema.orderLines)
    .where(eq(schema.orderLines.fulfilmentId, fulfilmentId));
  return r!.amount;
}

/** Releases every active reservation of an order, putting drop-ship and hub stock back. */
export async function releaseReservations(tx: Tx, orderId: string, productIds?: string[]) {
  if (productIds && !productIds.length) return 0;
  const conds = [
    eq(schema.stockReservations.orderId, orderId),
    inArray(schema.stockReservations.status, ['active', 'committed']),
  ];
  if (productIds) conds.push(inArray(schema.stockReservations.productId, productIds));
  const rows = await tx
    .select()
    .from(schema.stockReservations)
    .where(and(...conds))
    .for('update');
  for (const r of rows) {
    if (r.source === 'hub') {
      await tx
        .insert(schema.hubStockMovements)
        .values({ productId: r.productId, kind: 'release', qty: r.qty, orderId, reason: 'Released' });
    } else {
      await tx
        .update(schema.products)
        .set({ stockQty: sql`${schema.products.stockQty} + ${r.qty}` })
        .where(eq(schema.products.id, r.productId));
    }
    await tx
      .update(schema.stockReservations)
      .set({ status: 'released' })
      .where(eq(schema.stockReservations.id, r.id));
  }
  return rows.length;
}

/**
 * Re-reserves an expired order's stock at its snapshot quantities (late
 * payment, plan section 7). Returns false, changing nothing, if any line no
 * longer fits.
 */
export async function reReserve(tx: Tx, orderId: string): Promise<boolean> {
  const rows = await tx
    .select()
    .from(schema.stockReservations)
    .where(
      and(eq(schema.stockReservations.orderId, orderId), eq(schema.stockReservations.status, 'released')),
    );
  const ids = [...new Set(rows.map((r) => r.productId))].sort();
  if (!ids.length) return true;
  const products = await tx
    .select()
    .from(schema.products)
    .where(inArray(schema.products.id, ids))
    .orderBy(schema.products.id)
    .for('update');
  const hubLevels = await tx.execute<{ product_id: string; available: number }>(
    sql`select product_id, available from hub_stock_levels where product_id in ${ids}`,
  );
  const hub = new Map(Array.from(hubLevels, (r) => [r.product_id, Number(r.available)]));
  const need = new Map<string, number>();
  for (const r of rows) need.set(r.productId, (need.get(r.productId) ?? 0) + r.qty);
  for (const p of products) {
    const n = need.get(p.id)!;
    const have = p.fulfilmentMode === 'hub' ? (hub.get(p.id) ?? 0) : p.stockQty;
    if (have != null && have < n) return false;
  }
  for (const r of rows) {
    if (r.source === 'hub') {
      await tx.insert(schema.hubStockMovements).values({
        productId: r.productId,
        kind: 'reservation',
        qty: -r.qty,
        orderId,
        reason: 'Late payment',
      });
    } else {
      await tx
        .update(schema.products)
        .set({ stockQty: sql`${schema.products.stockQty} - ${r.qty}` })
        .where(eq(schema.products.id, r.productId));
    }
    await tx
      .update(schema.stockReservations)
      .set({ status: 'committed' })
      .where(eq(schema.stockReservations.id, r.id));
  }
  return true;
}

/** FR-CHK-09: expire unpaid orders past their deadline and release stock. Run by the worker every minute. */
export async function expireOrders(db: Database, now = new Date()): Promise<number> {
  const due = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.status, 'pending_payment'), lt(schema.orders.expiresAt, now)));
  let n = 0;
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, id)).for('update');
      if (o?.status !== 'pending_payment') return;
      await tx.update(schema.orders).set({ status: 'expired' }).where(eq(schema.orders.id, id));
      await releaseReservations(tx, id);
      n++;
    });
  }
  return n;
}

export interface Actor {
  id: string;
  kind: 'vendor' | 'admin';
}

/**
 * Moves one fulfilment along (FR-VP-07, FR-ORD-02), re-derives the parent
 * status, and tells the buyer. Rejection refunds that fulfilment's lines
 * through the refund path supplied by the caller.
 */
export async function transitionFulfilment(
  tx: Tx,
  fulfilmentId: string,
  event: FulfilmentEvent,
  opts: {
    trackingRef?: string;
    reason?: string;
    refund?: (orderId: string, amountKobo: number) => Promise<void>;
  },
) {
  const [f] = await tx
    .select()
    .from(schema.fulfilments)
    .where(eq(schema.fulfilments.id, fulfilmentId))
    .for('update');
  if (!f) throw conflict('NOT_FOUND', 'Fulfilment not found');
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, f.orderId)).for('update');
  if (!order || !['paid', 'in_fulfilment', 'delivered'].includes(order.status)) {
    throw conflict('ORDER_NOT_ACTIVE', 'This order is not waiting on fulfilment');
  }
  const to = nextFulfilmentStatus(f.status, event);
  if (!to)
    throw conflict('BAD_TRANSITION', `Cannot ${event} a fulfilment that is ${f.status.replaceAll('_', ' ')}`);
  const now = new Date();
  const set: Partial<typeof schema.fulfilments.$inferInsert> = { status: to };
  if (to === 'confirmed') set.confirmedAt = now;
  if (to === 'rejected') Object.assign(set, { rejectedAt: now, rejectReason: opts.reason ?? null });
  if (to === 'dispatched') Object.assign(set, { dispatchedAt: now, trackingRef: opts.trackingRef ?? null });
  if (to === 'delivered') set.deliveredAt = now;
  await tx.update(schema.fulfilments).set(set).where(eq(schema.fulfilments.id, f.id));

  const leafRows = await tx.select().from(schema.orderLines).where(eq(schema.orderLines.fulfilmentId, f.id));
  const productIds = [...new Set(leafRows.flatMap((l) => (l.productId ? [l.productId] : [])))];
  if (to === 'rejected') {
    await releaseReservations(tx, order.id, productIds);
    const amount = await fulfilmentAmount(tx, f.id);
    if (amount > 0 && opts.refund) await opts.refund(order.id, amount);
  }
  if (to === 'dispatched' && f.kind === 'hub' && productIds.length) {
    // Hub stock leaves on dispatch: a release plus a negative dispatch (hub_stock_levels).
    const res = await tx
      .select()
      .from(schema.stockReservations)
      .where(
        and(
          eq(schema.stockReservations.orderId, order.id),
          eq(schema.stockReservations.source, 'hub'),
          eq(schema.stockReservations.status, 'committed'),
          inArray(schema.stockReservations.productId, productIds),
        ),
      );
    for (const r of res) {
      await tx.insert(schema.hubStockMovements).values([
        { productId: r.productId, kind: 'release', qty: r.qty, orderId: order.id, reason: 'Dispatched' },
        { productId: r.productId, kind: 'dispatch', qty: -r.qty, orderId: order.id, reason: 'Dispatched' },
      ]);
      await tx
        .update(schema.stockReservations)
        .set({ status: 'released' })
        .where(eq(schema.stockReservations.id, r.id));
    }
  }

  const all = await tx
    .select({ status: schema.fulfilments.status })
    .from(schema.fulfilments)
    .where(eq(schema.fulfilments.orderId, order.id));
  const derived = deriveOrderStatus(
    order.status,
    all.map((x) => x.status),
  );
  // The last rejection cancels the order: no delivery will happen, so the fee goes back too.
  if (derived === 'cancelled' && order.status !== 'cancelled' && order.deliveryFeeKobo > 0 && opts.refund)
    await opts.refund(order.id, order.deliveryFeeKobo);
  // refund() flips a fully refunded order to 'refunded'; write the derived status after it so it stays 'cancelled'.
  if (derived !== order.status)
    await tx.update(schema.orders).set({ status: derived }).where(eq(schema.orders.id, order.id));

  const [vendor] = f.vendorId
    ? await tx
        .select({ name: schema.vendors.name })
        .from(schema.vendors)
        .where(eq(schema.vendors.id, f.vendorId))
    : [{ name: 'SideHustle hub' }];
  const template = {
    confirmed: 'fulfilment_confirmed',
    rejected: 'fulfilment_rejected',
    dispatched: 'fulfilment_dispatched',
    delivered: 'fulfilment_delivered',
  }[to as 'confirmed'];
  if (template) {
    await enqueue(
      tx,
      'notify.user',
      {
        to: order.buyerId,
        template,
        data: {
          ref: order.ref,
          vendor: vendor?.name,
          trackingRef: opts.trackingRef,
          amountKobo: to === 'rejected' ? await fulfilmentAmount(tx, f.id) : undefined,
          channels: ['sms', 'email'],
        },
      },
      `${template}:${f.id}`,
    );
  }
  return { fulfilmentId: f.id, status: to, orderStatus: derived };
}
