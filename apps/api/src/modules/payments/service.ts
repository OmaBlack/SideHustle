import { schema, type Database } from '@sidehustle/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../../lib/db.js';
import type { PaymentProvider } from '../../lib/payments/provider.js';
import { enqueue } from '../../lib/outbox.js';
import { conflict } from '../../lib/problems.js';
import { reReserve } from '../orders/service.js';

/**
 * Commission on what each vendor is actually paid (plan section 8a), from the
 * most specific rule: vendor, then category, then global.
 */
async function commissionBps(tx: Tx) {
  const rules = await tx.select().from(schema.commissionRules);
  return (vendorId: string, categoryId: string | null) =>
    (
      rules.find((r) => r.scope === 'vendor' && r.scopeId === vendorId) ??
      rules.find((r) => r.scope === 'category' && r.scopeId === categoryId) ??
      rules.find((r) => r.scope === 'global')
    )?.rateBps ?? 0;
}

/**
 * Balanced journals for a paid order (TRD §7.3). Payment: cash into
 * buyer_clearing; each vendor is owed its leaf lines less vendor-funded
 * discounts; platform-funded discounts are an expense; delivery and any kit
 * premium are platform revenue. Commission: a second journal moving each
 * vendor's commission to platform revenue. Each journal sums to zero.
 */
export async function writePaymentJournals(tx: Tx, order: typeof schema.orders.$inferSelect) {
  const lines = await tx.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, order.id));
  const leaves = lines.filter((l) => l.fulfilmentId);
  const payable = new Map<string, number>();
  let platformDiscount = 0;
  for (const l of leaves) {
    const gross = l.unitPriceKobo * l.qty;
    const vendorShare = l.discountFundedBy === 'vendor' ? l.discountKobo : 0;
    if (l.discountFundedBy === 'platform') platformDiscount += l.discountKobo;
    payable.set(l.vendorId!, (payable.get(l.vendorId!) ?? 0) + gross - vendorShare);
  }
  const owed = [...payable.values()].reduce((a, b) => a + b, 0);
  // Whatever the buyer paid beyond vendor payables and delivery, net of platform-funded discounts, is platform revenue.
  const platformRevenue = order.totalKobo - owed + platformDiscount;
  const [j] = await tx
    .insert(schema.ledgerJournals)
    .values({ orderId: order.id, kind: 'payment', memo: `Payment ${order.ref}` })
    .returning();
  const entries: (typeof schema.ledgerEntries.$inferInsert)[] = [
    { journalId: j!.id, account: 'buyer_clearing', amountKobo: order.totalKobo },
  ];
  for (const [vendorId, amount] of payable)
    entries.push({ journalId: j!.id, account: 'vendor_payable', vendorId, amountKobo: -amount });
  if (platformDiscount)
    entries.push({
      journalId: j!.id,
      account: 'platform_discount',
      amountKobo: platformDiscount,
      fundedBy: 'platform',
    });
  if (platformRevenue)
    entries.push({ journalId: j!.id, account: 'platform_revenue', amountKobo: -platformRevenue });
  await tx.insert(schema.ledgerEntries).values(entries);

  const productIds = [...new Set(leaves.map((l) => l.productId!))];
  const cats = productIds.length
    ? await tx
        .select({ id: schema.products.id, categoryId: schema.products.categoryId })
        .from(schema.products)
        .where(inArray(schema.products.id, productIds))
    : [];
  const catOf = new Map(cats.map((c) => [c.id, c.categoryId]));
  const rate = await commissionBps(tx);
  const commission = new Map<string, number>();
  for (const l of leaves) {
    const net = l.unitPriceKobo * l.qty - (l.discountFundedBy === 'vendor' ? l.discountKobo : 0);
    // Whole-kobo commission per line, rounded half-up.
    const c = Math.floor((net * rate(l.vendorId!, catOf.get(l.productId!) ?? null) + 5000) / 10_000);
    commission.set(l.vendorId!, (commission.get(l.vendorId!) ?? 0) + c);
  }
  const total = [...commission.values()].reduce((a, b) => a + b, 0);
  if (total > 0) {
    const [cj] = await tx
      .insert(schema.ledgerJournals)
      .values({ orderId: order.id, kind: 'commission', memo: `Commission ${order.ref}` })
      .returning();
    await tx.insert(schema.ledgerEntries).values([
      ...[...commission]
        .filter(([, c]) => c > 0)
        .map(([vendorId, c]) => ({
          journalId: cj!.id,
          account: 'vendor_payable' as const,
          vendorId,
          amountKobo: c,
        })),
      { journalId: cj!.id, account: 'platform_revenue' as const, amountKobo: -total },
    ]);
  }
}

export async function writeRefundJournal(tx: Tx, orderId: string, amountKobo: number, memo: string) {
  const [j] = await tx.insert(schema.ledgerJournals).values({ orderId, kind: 'refund', memo }).returning();
  await tx.insert(schema.ledgerEntries).values([
    { journalId: j!.id, account: 'refunds', amountKobo },
    { journalId: j!.id, account: 'buyer_clearing', amountKobo: -amountKobo },
  ]);
}

/** Issues a refund through the provider and records it, refusing to refund more than was paid. */
export async function refund(
  tx: Tx,
  provider: PaymentProvider,
  orderId: string,
  amountKobo: number,
  reason: string,
  opts: { fulfilmentId?: string | null; actorId?: string | null } = {},
) {
  const [payment] = await tx
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.orderId, orderId), eq(schema.payments.status, 'success')));
  if (!payment) throw conflict('NOT_PAID', 'This order has no successful payment to refund');
  const [done] = await tx
    .select({ sum: sql<number>`coalesce(sum(${schema.refunds.amountKobo}), 0)`.mapWith(Number) })
    .from(schema.refunds)
    .where(
      and(eq(schema.refunds.paymentId, payment.id), inArray(schema.refunds.status, ['pending', 'processed'])),
    );
  if (done!.sum + amountKobo > payment.amountKobo) {
    throw conflict(
      'REFUND_TOO_LARGE',
      'That is more than is left to refund',
      `Paid ${payment.amountKobo}, already refunded ${done!.sum}`,
    );
  }
  const { providerRef } = await provider.refund(payment.providerRef, amountKobo);
  const [r] = await tx
    .insert(schema.refunds)
    .values({
      paymentId: payment.id,
      fulfilmentId: opts.fulfilmentId ?? null,
      amountKobo,
      reason,
      status: 'processed',
      providerRef,
      actorId: opts.actorId ?? null,
    })
    .returning();
  await writeRefundJournal(tx, orderId, amountKobo, reason);
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (
    done!.sum + amountKobo === payment.amountKobo &&
    order &&
    !['expired', 'cancelled'].includes(order.status)
  ) {
    await tx.update(schema.orders).set({ status: 'refunded' }).where(eq(schema.orders.id, orderId));
  }
  await enqueue(
    tx,
    'notify.user',
    {
      to: order!.buyerId,
      template: 'order_refunded',
      data: { ref: order!.ref, amountKobo, channels: ['sms', 'email'] },
    },
    `refund:${r!.id}`,
  );
  return r!;
}

export type PaymentOutcome = 'paid' | 'duplicate' | 'late_paid' | 'late_refunded' | 'mismatch' | 'unknown';

/**
 * The only path that marks an order Paid (FR-CHK-06), used by the verified
 * webhook, the reconciliation job and the dev provider. Replays and
 * out-of-order events are no-ops (AC-08). A payment for an expired order
 * re-reserves stock if it can, otherwise it is refunded in full (section 7).
 */
export async function processPaymentSuccess(
  db: Database,
  provider: PaymentProvider,
  evt: { reference: string; amountKobo: number; currency: string; channel?: string; raw?: unknown },
): Promise<PaymentOutcome> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.ref, evt.reference))
      .for('update');
    if (!order) return 'unknown';
    const [payment] = await tx
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, order.id))
      .for('update');
    if (!payment) return 'unknown';
    if (payment.status === 'success') return 'duplicate';
    if (evt.amountKobo !== order.totalKobo || evt.currency !== 'NGN') {
      await tx
        .update(schema.payments)
        .set({ rawPayload: evt.raw ?? null })
        .where(eq(schema.payments.id, payment.id));
      return 'mismatch';
    }
    const now = new Date();
    await tx
      .update(schema.payments)
      .set({ status: 'success', paidAt: now, channel: evt.channel ?? null, rawPayload: evt.raw ?? null })
      .where(eq(schema.payments.id, payment.id));

    if (order.status === 'expired') {
      const ok = await reReserve(tx, order.id);
      if (!ok) {
        // Record the money in, then send it straight back.
        const [j] = await tx
          .insert(schema.ledgerJournals)
          .values({ orderId: order.id, kind: 'payment', memo: `Late payment ${order.ref}` })
          .returning();
        await tx.insert(schema.ledgerEntries).values([
          { journalId: j!.id, account: 'buyer_clearing', amountKobo: order.totalKobo },
          { journalId: j!.id, account: 'refunds', amountKobo: -order.totalKobo },
        ]);
        const { providerRef } = await provider.refund(payment.providerRef, order.totalKobo);
        await tx.insert(schema.refunds).values({
          paymentId: payment.id,
          amountKobo: order.totalKobo,
          reason: 'Late payment, stock no longer available',
          status: 'processed',
          providerRef,
        });
        await writeRefundJournal(tx, order.id, order.totalKobo, `Late payment refund ${order.ref}`);
        await enqueue(
          tx,
          'notify.user',
          {
            to: order.buyerId,
            template: 'late_payment_refunded',
            data: { ref: order.ref, amountKobo: order.totalKobo, channels: ['sms', 'email'] },
          },
          `late_refund:${order.id}`,
        );
        return 'late_refunded';
      }
    } else if (order.status !== 'pending_payment') {
      return 'duplicate';
    } else {
      await tx
        .update(schema.stockReservations)
        .set({ status: 'committed' })
        .where(
          and(eq(schema.stockReservations.orderId, order.id), eq(schema.stockReservations.status, 'active')),
        );
    }
    await tx.update(schema.orders).set({ status: 'paid', paidAt: now }).where(eq(schema.orders.id, order.id));
    await writePaymentJournals(tx, order);
    await enqueue(
      tx,
      'notify.user',
      {
        to: order.buyerId,
        template: 'order_paid',
        data: { ref: order.ref, totalKobo: order.totalKobo, channels: ['sms', 'email'] },
      },
      `order_paid:${order.id}`,
    );
    const fs = await tx.select().from(schema.fulfilments).where(eq(schema.fulfilments.orderId, order.id));
    for (const f of fs) {
      if (f.vendorId) {
        await enqueue(
          tx,
          'notify.vendor',
          { to: f.vendorId, template: 'vendor_new_order', data: { ref: order.ref } },
          `vendor_new_order:${f.id}`,
        );
      }
    }
    return order.status === 'expired' ? 'late_paid' : 'paid';
  });
}
