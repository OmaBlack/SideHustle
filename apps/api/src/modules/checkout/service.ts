import { schema, type Database } from '@sidehustle/db';
import type { PricedLine } from '@sidehustle/pricing';
import { toE164, type CheckoutInput } from '@sidehustle/schemas';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { HttpProblem } from '../../errors.js';
import type { AuthUser } from '../../lib/auth.js';
import { orderRef } from '../../lib/crypto.js';
import type { Tx } from '../../lib/db.js';
import { loadPricingContext, type StoredCartLine } from '../../lib/pricing.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/problems.js';
import { minutesFromNow } from '../../lib/time.js';
import { appConfigValue } from '../catalogue/service.js';
import { loadLines, priceLines } from '../cart/service.js';

export interface QuotePayload {
  delivery: { code: string; name: string; feeKobo: number; etaText: string | null };
  recipient: string;
  phone: string;
  address: CheckoutInput['address'] | null;
  /** What was priced, line by line; order creation must reproduce it exactly (FR-CHK-05). */
  signature: string;
  subtotalKobo: number;
  discountKobo: number;
  lines: { cartLineId: string; unitKobo: number; qty: number; lineTotalKobo: number; discountKobo: number }[];
}

function signatureOf(rows: StoredCartLine[], lines: PricedLine[]) {
  return JSON.stringify(
    rows.map((r, i) => [
      r.id,
      r.lineType,
      r.productId,
      r.kitId,
      r.qty,
      r.options,
      r.note,
      r.items,
      lines[i]!.unitKobo,
      lines[i]!.lineTotalKobo,
      lines[i]!.discountKobo,
    ]),
  );
}

async function deliveryFor(db: Tx, input: CheckoutInput) {
  const [m] = await db
    .select()
    .from(schema.deliveryMethods)
    .where(
      and(eq(schema.deliveryMethods.code, input.deliveryMethod), eq(schema.deliveryMethods.active, true)),
    );
  if (!m) throw badRequest('UNKNOWN_DELIVERY', 'Choose a delivery method');
  const needsAddress = m.code !== 'pickup';
  if (needsAddress && !input.address) {
    throw new HttpProblem(400, 'VALIDATION_FAILED', 'Some fields are not valid', undefined, {
      fields: { 'address.line1': 'Enter a delivery address' },
    });
  }
  if (needsAddress && m.eligibleStates.length && !m.eligibleStates.includes(input.address!.state)) {
    throw new HttpProblem(
      400,
      'DELIVERY_NOT_AVAILABLE',
      `${m.name} is not available in ${input.address!.state}`,
      undefined,
      {
        fields: { deliveryMethod: `${m.name} only covers ${m.eligibleStates.join(', ')}` },
      },
    );
  }
  return { m, needsAddress };
}

/**
 * FR-CHK-04/05: recompute everything, refuse what cannot be ordered, and store
 * a 15-minute quote. `changes` lists lines whose price moved since the buyer
 * last saw them.
 */
export async function createQuote(db: Database, user: AuthUser, input: CheckoutInput) {
  if (!user.phoneVerified || !user.emailVerified) {
    throw new HttpProblem(
      403,
      'VERIFICATION_REQUIRED',
      'Verify your phone and email before your first checkout',
      undefined,
      {
        phoneVerified: user.phoneVerified,
        emailVerified: user.emailVerified,
      },
    );
  }
  const phone = toE164(input.phone);
  if (!phone) {
    throw new HttpProblem(400, 'VALIDATION_FAILED', 'Some fields are not valid', undefined, {
      fields: { phone: 'Enter a Nigerian mobile number' },
    });
  }
  const { m, needsAddress } = await deliveryFor(db, input);
  const ctx = await loadPricingContext(db);
  const lines = await loadLines(db, user.id);
  if (!lines.length) throw badRequest('CART_EMPTY', 'Your cart is empty');
  const { totals, rows, missing } = priceLines(lines, ctx, m.feeKobo);
  if (missing.length || totals.issues.length) {
    throw conflict('CART_NOT_READY', 'Some items in your cart need attention', 'Open your cart to fix them');
  }
  const changes = rows.flatMap((r, i) =>
    r.seenUnitKobo != null && r.seenUnitKobo !== totals.lines[i]!.unitKobo
      ? [{ cartLineId: r.id, fromKobo: r.seenUnitKobo, toKobo: totals.lines[i]!.unitKobo }]
      : [],
  );
  const payload: QuotePayload = {
    delivery: { code: m.code, name: m.name, feeKobo: m.feeKobo, etaText: m.etaText },
    recipient: input.recipient,
    phone,
    address: needsAddress ? input.address! : null,
    signature: signatureOf(rows, totals.lines),
    subtotalKobo: totals.subtotalKobo,
    discountKobo: totals.bundleDiscountKobo,
    lines: rows.map((r, i) => ({
      cartLineId: r.id,
      unitKobo: totals.lines[i]!.unitKobo,
      qty: r.qty,
      lineTotalKobo: totals.lines[i]!.lineTotalKobo,
      discountKobo: totals.lines[i]!.discountKobo,
    })),
  };
  const ttl = await appConfigValue(db, 'quote_ttl_minutes', 15);
  const [q] = await db
    .insert(schema.checkoutQuotes)
    .values({ userId: user.id, payload, totalKobo: totals.totalKobo, expiresAt: minutesFromNow(ttl) })
    .returning();
  // Seeing the quote counts as seeing the new prices.
  for (const [i, r] of rows.entries()) {
    await db
      .update(schema.cartLines)
      .set({ seenUnitKobo: totals.lines[i]!.unitKobo, seenAvailable: true })
      .where(eq(schema.cartLines.id, r.id));
  }
  return {
    id: q!.id,
    expiresAt: q!.expiresAt,
    subtotalKobo: totals.subtotalKobo,
    bundleDiscountKobo: totals.bundleDiscountKobo,
    deliveryKobo: m.feeKobo,
    totalKobo: totals.totalKobo,
    delivery: payload.delivery,
    changes,
  };
}

type LeafLine = {
  productId: string;
  vendorId: string;
  name: string;
  unitKobo: number;
  qty: number;
  discountKobo: number;
  fundedBy: 'vendor' | 'platform' | null;
  options: unknown;
  note: string | null;
  mode: 'drop_ship' | 'hub';
};

/**
 * FR-CHK-07, FR-ORD-04/07/08: turns a quote into a PendingPayment order with
 * snapshots, fulfilments (one per drop-ship vendor, one for the hub) and stock
 * reservations, all in one transaction under row locks. A second call with the
 * same quote returns the first order.
 */
export async function createOrder(
  db: Database,
  user: AuthUser,
  quoteId: string,
  provider: 'paystack' | 'flutterwave' | 'dev',
) {
  return db.transaction(async (tx) => {
    const [quote] = await tx
      .select()
      .from(schema.checkoutQuotes)
      .where(eq(schema.checkoutQuotes.id, quoteId))
      .for('update');
    if (!quote || quote.userId !== user.id) throw notFound('Quote not found');
    const [already] = await tx.select().from(schema.orders).where(eq(schema.orders.quoteId, quoteId));
    if (already) return { order: already, created: false };
    if (quote.expiresAt.getTime() < Date.now())
      throw conflict('QUOTE_EXPIRED', 'Your checkout timed out. Please review the total again.');
    const payload = quote.payload as QuotePayload;

    const lines = await loadLines(tx, user.id);
    const productIds = new Set<string>();
    for (const l of lines) {
      if (l.productId) productIds.add(l.productId);
      for (const i of (l.items as { productId: string }[] | null) ?? []) productIds.add(i.productId);
    }
    const kitIds = lines.flatMap((l) => (l.kitId ? [l.kitId] : []));
    const kitItemRows = kitIds.length
      ? await tx.select().from(schema.kitItems).where(inArray(schema.kitItems.kitId, kitIds))
      : [];
    for (const k of kitItemRows) productIds.add(k.productId);
    const ids = [...productIds];
    // Lock product rows (drop-ship stock) and hub stock rows before reading stock, so concurrent orders serialise.
    const prodRows = ids.length
      ? await tx
          .select()
          .from(schema.products)
          .where(inArray(schema.products.id, ids))
          .orderBy(schema.products.id)
          .for('update')
      : [];
    if (ids.length)
      await tx
        .select()
        .from(schema.hubStock)
        .where(inArray(schema.hubStock.productId, ids))
        .orderBy(schema.hubStock.productId)
        .for('update');

    const ctx = await loadPricingContext(tx);
    const { totals, rows, missing } = priceLines(lines, ctx, payload.delivery.feeKobo);
    const signature = signatureOf(rows, totals.lines);
    if (
      missing.length ||
      totals.issues.length ||
      signature !== payload.signature ||
      totals.totalKobo !== quote.totalKobo
    ) {
      throw conflict(
        'QUOTE_STALE',
        'Prices or stock changed since you reviewed your order',
        'Review the new total and try again',
      );
    }

    const pById = new Map(prodRows.map((p) => [p.id, p]));
    const kits = kitIds.length
      ? await tx.select().from(schema.kits).where(inArray(schema.kits.id, kitIds))
      : [];
    const kitName = new Map(kits.map((k) => [k.id, k.name]));

    const ref = orderRef();
    const expiry = await appConfigValue(tx, 'order_expiry_minutes', 30);
    const expiresAt = minutesFromNow(expiry);
    const [order] = await tx
      .insert(schema.orders)
      .values({
        ref,
        buyerId: user.id,
        quoteId,
        subtotalKobo: totals.subtotalKobo,
        discountKobo: totals.bundleDiscountKobo,
        deliveryFeeKobo: totals.deliveryKobo,
        totalKobo: totals.totalKobo,
        deliveryMethod: payload.delivery.code,
        address: payload.address,
        recipient: payload.recipient,
        phone: payload.phone,
        expiresAt,
      })
      .returning();

    // Leaf lines are what fulfilments ship; kit and bundle lines get children (order_lines.parent_line_id).
    const fulfilmentIds = new Map<string, string>();
    const fulfilmentFor = async (leaf: { vendorId: string; mode: 'drop_ship' | 'hub' }) => {
      const key = leaf.mode === 'hub' ? 'hub' : leaf.vendorId;
      let id = fulfilmentIds.get(key);
      if (!id) {
        const [f] = await tx
          .insert(schema.fulfilments)
          .values({
            orderId: order!.id,
            kind: leaf.mode === 'hub' ? 'hub' : 'vendor',
            vendorId: leaf.mode === 'hub' ? null : leaf.vendorId,
          })
          .returning({ id: schema.fulfilments.id });
        id = f!.id;
        fulfilmentIds.set(key, id);
      }
      return id;
    };
    const insertLeaf = async (
      leaf: LeafLine,
      parentLineId: string | null,
      lineType: 'product' | 'kit' | 'bundle',
      extra: Partial<typeof schema.orderLines.$inferInsert> = {},
    ) => {
      await tx.insert(schema.orderLines).values({
        orderId: order!.id,
        parentLineId,
        fulfilmentId: await fulfilmentFor(leaf),
        vendorId: leaf.vendorId,
        lineType,
        productId: leaf.productId,
        nameSnapshot: leaf.name,
        unitPriceKobo: leaf.unitKobo,
        qty: leaf.qty,
        discountKobo: leaf.discountKobo,
        discountFundedBy: leaf.fundedBy,
        optionsSnapshot: leaf.options ?? null,
        note: leaf.note,
        ...extra,
      });
    };
    const demand = new Map<string, number>();
    const want = (productId: string, qty: number) =>
      demand.set(productId, (demand.get(productId) ?? 0) + qty);

    for (const [i, row] of rows.entries()) {
      const pl = totals.lines[i]!;
      if (pl.kind === 'product') {
        const p = pById.get(pl.productId)!;
        want(p.id, pl.qty);
        await insertLeaf(
          {
            productId: p.id,
            vendorId: p.vendorId,
            name: p.name,
            unitKobo: pl.unitKobo,
            qty: pl.qty,
            discountKobo: 0,
            fundedBy: null,
            options: { selection: row.options ?? {}, text: pl.optionText },
            note: row.note,
            mode: p.fulfilmentMode,
          },
          null,
          'product',
        );
        continue;
      }
      const [parent] = await tx
        .insert(schema.orderLines)
        .values({
          orderId: order!.id,
          lineType: pl.kind,
          kitId: pl.kind === 'kit' ? pl.kitId : null,
          bundleId: pl.kind === 'bundle' ? row.id : null,
          nameSnapshot: pl.kind === 'kit' ? kitName.get(pl.kitId)! : row.name || 'Custom kit',
          unitPriceKobo: pl.unitKobo,
          qty: pl.qty,
          discountKobo: pl.discountKobo,
          discountFundedBy: pl.kind === 'bundle' && pl.discountKobo > 0 ? 'platform' : null,
        })
        .returning({ id: schema.orderLines.id });
      if (pl.kind === 'kit') {
        const platform = pl.kit.gapFundedBy === 'platform';
        for (const c of pl.kit.components) {
          const p = pById.get(c.productId)!;
          want(p.id, c.qty);
          await insertLeaf(
            {
              productId: p.id,
              vendorId: p.vendorId,
              name: p.name,
              unitKobo: p.costKobo,
              qty: c.qty,
              discountKobo: c.gapShareKobo,
              fundedBy: c.gapShareKobo > 0 ? (platform ? 'platform' : 'vendor') : null,
              options: null,
              note: null,
              mode: p.fulfilmentMode,
            },
            parent!.id,
            'kit',
          );
        }
      } else {
        const items = (row.items as { selection?: unknown; note?: string }[]) ?? [];
        for (const [j, bl] of pl.bundle.lines.entries()) {
          const p = pById.get(bl.productId)!;
          want(p.id, bl.qty);
          await insertLeaf(
            {
              productId: p.id,
              vendorId: p.vendorId,
              name: p.name,
              unitKobo: bl.unitKobo,
              qty: bl.qty,
              discountKobo: bl.discountKobo,
              fundedBy: bl.discountKobo > 0 ? 'platform' : null,
              options: { selection: items[j]?.selection ?? {}, text: bl.optionText },
              note: items[j]?.note ?? null,
              mode: p.fulfilmentMode,
            },
            parent!.id,
            'bundle',
          );
        }
      }
    }

    // FR-CHK-09 / FR-ADM-07: reserve now, release on expiry or cancel.
    for (const [productId, qty] of demand) {
      const p = pById.get(productId)!;
      if (p.fulfilmentMode === 'hub') {
        await tx
          .insert(schema.hubStockMovements)
          .values({ productId, kind: 'reservation', qty: -qty, orderId: order!.id, reason: `Order ${ref}` });
        await tx
          .insert(schema.stockReservations)
          .values({ orderId: order!.id, productId, source: 'hub', qty, expiresAt });
      } else if (p.stockQty != null) {
        await tx
          .update(schema.products)
          .set({ stockQty: sql`${schema.products.stockQty} - ${qty}` })
          .where(eq(schema.products.id, productId));
        await tx
          .insert(schema.stockReservations)
          .values({ orderId: order!.id, productId, source: 'drop_ship', qty, expiresAt });
      }
    }

    await tx
      .insert(schema.payments)
      .values({ orderId: order!.id, provider, providerRef: ref, amountKobo: totals.totalKobo })
      .onConflictDoNothing();
    await tx.delete(schema.cartLines).where(
      inArray(
        schema.cartLines.id,
        rows.map((r) => r.id),
      ),
    );
    return { order: order!, created: true };
  });
}

export function assertOwner(order: { buyerId: string }, user: AuthUser) {
  if (order.buyerId !== user.id) throw forbidden();
}
