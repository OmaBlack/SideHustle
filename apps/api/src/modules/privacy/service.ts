import { schema, type Database } from '@sidehustle/db';
import { RETENTION_TYPES, type RetentionType } from '@sidehustle/schemas';
import { and, desc, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { randomToken } from '../../lib/crypto.js';
import { audit } from '../../lib/audit.js';
import { conflict } from '../../lib/problems.js';

/**
 * NDPA 2023 s.34 (access) and s.38 (portability): everything held about one
 * person, in a machine-readable form. Secrets (password hash, token hashes)
 * are not personal data the person can use and are left out.
 */
export async function exportUserData(db: Database, userId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw conflict('NOT_FOUND', 'Account not found');
  const [consents, sessions, orders, requests, bundles, notifications, dataRequests, staff] =
    await Promise.all([
      db.select().from(schema.consents).where(eq(schema.consents.userId, userId)),
      db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId)),
      db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.buyerId, userId))
        .orderBy(desc(schema.orders.createdAt)),
      db.select().from(schema.customRequests).where(eq(schema.customRequests.buyerId, userId)),
      db.select().from(schema.savedBundles).where(eq(schema.savedBundles.userId, userId)),
      db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)),
      db.select().from(schema.dataRequests).where(eq(schema.dataRequests.userId, userId)),
      db.select().from(schema.vendorStaff).where(eq(schema.vendorStaff.userId, userId)),
    ]);
  const orderIds = orders.map((o) => o.id);
  const lines = orderIds.length
    ? await db.select().from(schema.orderLines).where(inArray(schema.orderLines.orderId, orderIds))
    : [];
  const payments = orderIds.length
    ? await db.select().from(schema.payments).where(inArray(schema.payments.orderId, orderIds))
    : [];
  return {
    exportedAt: new Date().toISOString(),
    format: 'sidehustle-personal-data/1',
    profile: {
      id: u.id,
      name: u.name,
      businessName: u.businessName,
      email: u.email,
      phone: u.phone,
      state: u.state,
      interests: u.interests,
      role: u.role,
      emailVerifiedAt: u.emailVerifiedAt,
      phoneVerifiedAt: u.phoneVerifiedAt,
      createdAt: u.createdAt,
    },
    consents: consents.map((c) => ({
      purpose: c.purpose,
      policyVersion: c.policyVersion,
      grantedAt: c.grantedAt,
      withdrawnAt: c.withdrawnAt,
    })),
    sessions: sessions.map((s) => ({
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      userAgent: s.userAgent,
      ip: s.ip,
      revokedAt: s.revokedAt,
    })),
    orders: orders.map((o) => ({
      ref: o.ref,
      status: o.status,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      totalKobo: o.totalKobo,
      deliveryMethod: o.deliveryMethod,
      recipient: o.recipient,
      phone: o.phone,
      address: o.address,
      lines: lines
        .filter((l) => l.orderId === o.id && !l.parentLineId)
        .map((l) => ({
          name: l.nameSnapshot,
          qty: l.qty,
          unitPriceKobo: l.unitPriceKobo,
          discountKobo: l.discountKobo,
          note: l.note,
        })),
      payments: payments
        .filter((p) => p.orderId === o.id)
        .map((p) => ({
          provider: p.provider,
          status: p.status,
          amountKobo: p.amountKobo,
          channel: p.channel,
          paidAt: p.paidAt,
        })),
    })),
    customRequests: requests.map((r) => ({
      projectType: r.projectType,
      brief: r.brief,
      status: r.status,
      vendorReply: r.vendorReply,
      quotedAmountKobo: r.quotedAmountKobo,
      createdAt: r.createdAt,
    })),
    savedKits: bundles.map((b) => ({ name: b.name, items: b.items, updatedAt: b.updatedAt })),
    messages: notifications.map((n) => ({ channel: n.channel, template: n.template, sentAt: n.sentAt })),
    dataRequests: dataRequests.map((d) => ({
      kind: d.kind,
      status: d.status,
      createdAt: d.createdAt,
      completedAt: d.completedAt,
    })),
    vendorTeams: staff.map((s) => ({ vendorId: s.vendorId, role: s.role })),
  };
}

const ACTIVE_ORDER = ['pending_payment', 'paid', 'in_fulfilment', 'delivered', 'disputed'] as const;

/**
 * NDPA s.36 (erasure). Removes or anonymises the person's data. Orders and
 * payments are kept for the legal retention period (accounting and tax), with
 * the buyer account anonymised; their delivery details are cleared by the
 * retention job when that period ends. Refused while an order is still
 * active or while the person runs a vendor team, so nobody loses a delivery
 * or a business by accident.
 */
export async function eraseUser(db: Database, userId: string) {
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).for('update');
    if (!u || u.deletedAt) throw conflict('NOT_FOUND', 'Account not found');
    const active = await tx
      .select({ ref: schema.orders.ref })
      .from(schema.orders)
      .where(and(eq(schema.orders.buyerId, userId), inArray(schema.orders.status, [...ACTIVE_ORDER])));
    if (active.length) {
      throw conflict(
        'ACTIVE_ORDERS',
        'You have orders still in progress',
        `Wait until ${active.map((a) => a.ref).join(', ')} ${active.length === 1 ? 'is' : 'are'} delivered or cancelled, then try again.`,
      );
    }
    const staff = await tx.select().from(schema.vendorStaff).where(eq(schema.vendorStaff.userId, userId));
    if (staff.length) {
      throw conflict(
        'VENDOR_ACCOUNT',
        'You are part of a vendor team',
        'Contact support to close or hand over the vendor account first.',
      );
    }
    const now = new Date();
    await tx
      .update(schema.users)
      .set({
        name: 'Deleted user',
        businessName: null,
        email: `deleted+${u.id}@sidehustle.invalid`,
        phone: `deleted:${u.id}`,
        passwordHash: `!deleted:${randomToken(16)}`,
        state: null,
        interests: [],
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        deletedAt: now,
      })
      .where(eq(schema.users.id, userId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await tx.delete(schema.otpCodes).where(eq(schema.otpCodes.userId, userId));
    await tx.delete(schema.emailTokens).where(eq(schema.emailTokens.userId, userId));
    await tx.delete(schema.carts).where(eq(schema.carts.userId, userId));
    await tx.delete(schema.savedBundles).where(eq(schema.savedBundles.userId, userId));
    await tx.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.userId, userId));
    await tx.delete(schema.notifications).where(eq(schema.notifications.userId, userId));
    await tx
      .delete(schema.outbox)
      .where(and(isNull(schema.outbox.sentAt), sql`${schema.outbox.payload}->>'to' = ${userId}`));
    await tx
      .update(schema.outbox)
      .set({ payload: sql`'{}'::jsonb` })
      .where(sql`${schema.outbox.payload}->>'to' = ${userId}`);
    await tx
      .update(schema.checkoutQuotes)
      .set({ payload: sql`'{}'::jsonb` })
      .where(eq(schema.checkoutQuotes.userId, userId));
    await tx
      .update(schema.customRequests)
      .set({ brief: '[removed at the buyer’s request]', quantityEstimate: null })
      .where(eq(schema.customRequests.buyerId, userId));
    await tx
      .update(schema.consents)
      .set({ withdrawnAt: now })
      .where(and(eq(schema.consents.userId, userId), isNull(schema.consents.withdrawnAt)));
    await tx.insert(schema.dataRequests).values({ userId, kind: 'delete', status: 'done', completedAt: now });
    await audit(tx, userId, 'account.erase', 'user', userId, { orders_kept_for_legal_retention: true });
  });
}

const day = 86_400_000;

/**
 * FR-ADM-10, DR-06: nightly retention. Each `retention_policies` row names a
 * data type from RETENTION_TYPES; types without a row are left alone. Returns
 * rows affected per type.
 */
export async function runRetention(db: Database, now = new Date()) {
  const policies = await db.select().from(schema.retentionPolicies);
  const out: Partial<Record<RetentionType, number>> = {};
  for (const p of policies) {
    const type = p.dataType as RetentionType;
    const rule = RETENTION_TYPES[type];
    if (!rule) continue;
    // Never act on a period shorter than the legal minimum, even if the row was edited directly in the database.
    const days = Math.max(p.retainDays, rule.minDays);
    const before = new Date(now.getTime() - days * day);
    let n = 0;
    if (type === 'sessions') {
      n = (
        await db
          .delete(schema.sessions)
          .where(
            and(
              or(isNotNull(schema.sessions.revokedAt), lt(schema.sessions.expiresAt, now)),
              lt(schema.sessions.lastSeenAt, before),
            ),
          )
          .returning({ id: schema.sessions.id })
      ).length;
    } else if (type === 'auth_codes') {
      n += (
        await db
          .delete(schema.otpCodes)
          .where(lt(schema.otpCodes.createdAt, before))
          .returning({ id: schema.otpCodes.id })
      ).length;
      n += (
        await db
          .delete(schema.emailTokens)
          .where(lt(schema.emailTokens.createdAt, before))
          .returning({ id: schema.emailTokens.id })
      ).length;
    } else if (type === 'outbox') {
      n = (
        await db
          .delete(schema.outbox)
          .where(and(isNotNull(schema.outbox.sentAt), lt(schema.outbox.sentAt, before)))
          .returning({ id: schema.outbox.id })
      ).length;
    } else if (type === 'notifications') {
      n = (
        await db
          .delete(schema.notifications)
          .where(lt(schema.notifications.createdAt, before))
          .returning({ id: schema.notifications.id })
      ).length;
    } else if (type === 'checkout_quotes') {
      const used = db.select({ id: schema.orders.quoteId }).from(schema.orders);
      n = (
        await db
          .delete(schema.checkoutQuotes)
          .where(and(lt(schema.checkoutQuotes.createdAt, before), notInArray(schema.checkoutQuotes.id, used)))
          .returning({ id: schema.checkoutQuotes.id })
      ).length;
    } else if (type === 'idempotency_keys') {
      n = (
        await db
          .delete(schema.idempotencyKeys)
          .where(lt(schema.idempotencyKeys.expiresAt, before))
          .returning({ key: schema.idempotencyKeys.key })
      ).length;
    } else if (type === 'payment_payloads') {
      n = (
        await db
          .update(schema.payments)
          .set({ rawPayload: null })
          .where(and(isNotNull(schema.payments.rawPayload), lt(schema.payments.createdAt, before)))
          .returning({ id: schema.payments.id })
      ).length;
    } else if (type === 'custom_requests') {
      n = (
        await db
          .update(schema.customRequests)
          .set({ brief: '[archived]', vendorReply: null, quantityEstimate: null })
          .where(
            and(
              lt(schema.customRequests.updatedAt, before),
              sql`${schema.customRequests.brief} <> '[archived]'`,
            ),
          )
          .returning({ id: schema.customRequests.id })
      ).length;
    } else if (type === 'orders') {
      const old = await db
        .update(schema.orders)
        .set({ recipient: '[archived]', phone: '[archived]', address: null })
        .where(and(lt(schema.orders.createdAt, before), sql`${schema.orders.recipient} <> '[archived]'`))
        .returning({ quoteId: schema.orders.quoteId });
      if (old.length) {
        await db
          .update(schema.checkoutQuotes)
          .set({ payload: sql`'{}'::jsonb` })
          .where(
            inArray(
              schema.checkoutQuotes.id,
              old.map((o) => o.quoteId),
            ),
          );
      }
      n = old.length;
    }
    out[type] = n;
  }
  return out;
}

/** Keeps only what reconciliation and disputes need from a provider payload (data minimisation, NDPA s.24). */
export function minimalPaymentPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as { event?: unknown; data?: Record<string, unknown> };
  const d = b.data ?? {};
  const pick = (k: string) => (d[k] === undefined ? undefined : d[k]);
  return {
    event: b.event,
    id: pick('id'),
    reference: pick('reference'),
    status: pick('status'),
    amount: pick('amount'),
    currency: pick('currency'),
    channel: pick('channel'),
    paid_at: pick('paid_at'),
    gateway_response: pick('gateway_response'),
  };
}
