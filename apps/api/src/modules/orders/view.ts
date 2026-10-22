import { schema, type Database } from '@sidehustle/db';
import { asc, eq, inArray } from 'drizzle-orm';
import { stepsDone } from './service.js';

type OrderRow = typeof schema.orders.$inferSelect;

/** FR-ORD-01/03/04: order with per-fulfilment status and tracking, lines from snapshots (FR-ORD-07). */
export async function orderViews(db: Database, orders: OrderRow[], opts: { vendorId?: string } = {}) {
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const [lines, fulfilments, payments] = await Promise.all([
    db
      .select()
      .from(schema.orderLines)
      .where(inArray(schema.orderLines.orderId, ids))
      .orderBy(asc(schema.orderLines.createdAt), asc(schema.orderLines.id)),
    db
      .select({ f: schema.fulfilments, vendorName: schema.vendors.name, vendorSlug: schema.vendors.slug })
      .from(schema.fulfilments)
      .leftJoin(schema.vendors, eq(schema.vendors.id, schema.fulfilments.vendorId))
      .where(inArray(schema.fulfilments.orderId, ids))
      .orderBy(asc(schema.fulfilments.createdAt)),
    db.select().from(schema.payments).where(inArray(schema.payments.orderId, ids)),
  ]);
  return orders.map((o) => {
    const own = lines.filter((l) => l.orderId === o.id);
    const top = own.filter((l) => !l.parentLineId);
    const fs = fulfilments
      .filter((f) => f.f.orderId === o.id)
      .filter((f) => !opts.vendorId || f.f.vendorId === opts.vendorId);
    const pay = payments.find((p) => p.orderId === o.id);
    return {
      id: o.id,
      ref: o.ref,
      status: o.status,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      expiresAt: o.expiresAt,
      deliveryMethod: o.deliveryMethod,
      recipient: o.recipient,
      phone: o.phone,
      address: o.address,
      subtotalKobo: o.subtotalKobo,
      discountKobo: o.discountKobo,
      deliveryFeeKobo: o.deliveryFeeKobo,
      totalKobo: o.totalKobo,
      itemCount: own.filter((l) => l.fulfilmentId).reduce((s, l) => s + l.qty, 0),
      payment: pay ? { status: pay.status, provider: pay.provider, channel: pay.channel } : null,
      lines: opts.vendorId
        ? []
        : top.map((l) => ({
            id: l.id,
            kind: l.lineType,
            name: l.nameSnapshot,
            qty: l.qty,
            unitKobo: l.unitPriceKobo,
            discountKobo: l.discountKobo,
            totalKobo: l.unitPriceKobo * l.qty - l.discountKobo,
            optionText: (l.optionsSnapshot as { text?: string } | null)?.text ?? '',
            note: l.note,
            kitId: l.kitId,
            productId: l.productId,
            children: own
              .filter((c) => c.parentLineId === l.id)
              .map((c) => ({ name: c.nameSnapshot, qty: c.qty })),
          })),
      fulfilments: fs.map(({ f, vendorName, vendorSlug }) => ({
        id: f.id,
        kind: f.kind,
        vendor: f.vendorId ? { id: f.vendorId, name: vendorName, slug: vendorSlug } : null,
        status: f.status,
        stepsDone: stepsDone(f.status),
        trackingRef: f.trackingRef,
        rejectReason: f.rejectReason,
        confirmedAt: f.confirmedAt,
        dispatchedAt: f.dispatchedAt,
        deliveredAt: f.deliveredAt,
        createdAt: f.createdAt,
        items: own
          .filter((l) => l.fulfilmentId === f.id)
          .map((l) => ({
            name: l.nameSnapshot,
            qty: l.qty,
            unitKobo: l.unitPriceKobo,
            discountKobo: l.discountKobo,
            optionText: (l.optionsSnapshot as { text?: string } | null)?.text ?? '',
            note: l.note,
            productId: l.productId,
          })),
      })),
    };
  });
}
