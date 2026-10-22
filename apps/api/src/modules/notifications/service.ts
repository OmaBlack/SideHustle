import { schema, type Database } from '@sidehustle/db';
import { and, asc, eq, gt, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Notifier } from '../../lib/notifier.js';
import type { NotifyPayload } from '../../lib/outbox.js';
import { enqueue } from '../../lib/outbox.js';
import type { PaymentProvider } from '../../lib/payments/provider.js';
import { renderTemplate } from '../../lib/templates.js';
import { processPaymentSuccess } from '../payments/service.js';

const MAX_ATTEMPTS = 8;

/**
 * Data fields that carry one-time secrets (OTP codes, email/reset links with
 * raw tokens). They are replaced once a message is sent or given up on.
 * Any new template carrying a secret must add its field here.
 */
const SECRET_FIELDS = ['code', 'link'] as const;
const SECRET_TEMPLATES = ['otp', 'verify_email', 'password_reset'];

function redactData(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const f of SECRET_FIELDS) if (f in out) out[f] = '[redacted]';
  return out;
}

function redactPayload(p: NotifyPayload): NotifyPayload {
  return { ...p, data: redactData(p.data) };
}

/**
 * Sends queued messages (FR-NOT-01/02). Each outbox row becomes one
 * notification per channel, sent through the notifier, and is marked sent;
 * failures retry with backoff on the next run (NFR-REL-04).
 */
export async function drainOutbox(db: Database, notifier: Notifier, limit = 50): Promise<number> {
  // Rows that gave up without sending must not keep their secrets at rest.
  await db
    .update(schema.outbox)
    .set({
      payload: sql`jsonb_set(${schema.outbox.payload}, '{data}', (${schema.outbox.payload}->'data') || ${JSON.stringify(
        Object.fromEntries(SECRET_FIELDS.map((f) => [f, '[redacted]'])),
      )}::jsonb)`,
    })
    .where(
      and(
        isNull(schema.outbox.sentAt),
        gte(schema.outbox.attempts, MAX_ATTEMPTS),
        inArray(sql`${schema.outbox.payload}->>'template'`, SECRET_TEMPLATES),
      ),
    );
  const rows = await db
    .select()
    .from(schema.outbox)
    .where(
      and(
        isNull(schema.outbox.sentAt),
        lt(schema.outbox.attempts, MAX_ATTEMPTS),
        // Backoff: wait 2^attempts × 30 seconds after the last attempt.
        sql`${schema.outbox.createdAt} + (interval '30 seconds' * (power(2, ${schema.outbox.attempts}) - 1)) <= now()`,
      ),
    )
    .orderBy(asc(schema.outbox.createdAt))
    .limit(limit);
  let sent = 0;
  for (const row of rows) {
    const p = row.payload as NotifyPayload & { data: { channels?: ('sms' | 'email')[] } };
    try {
      const recipients =
        row.topic === 'notify.vendor'
          ? await db
              .select({ id: schema.users.id, phone: schema.users.phone, email: schema.users.email })
              .from(schema.vendorStaff)
              .innerJoin(schema.users, eq(schema.users.id, schema.vendorStaff.userId))
              .where(eq(schema.vendorStaff.vendorId, p.to))
          : await db
              .select({ id: schema.users.id, phone: schema.users.phone, email: schema.users.email })
              .from(schema.users)
              .where(eq(schema.users.id, p.to));
      const channels = p.data.channels ?? ['sms', 'email'];
      const text = renderTemplate(p.template, p.data);
      for (const r of recipients) {
        for (const channel of channels) {
          const to = channel === 'sms' ? r.phone : r.email;
          const { providerRef } = await notifier.send({ channel, to, template: p.template, text });
          await db.insert(schema.notifications).values({
            userId: r.id,
            channel,
            template: p.template,
            status: 'sent',
            // Never keep one-time codes or links at rest.
            payload: redactData(p.data),
            providerRef,
            sentAt: new Date(),
          });
        }
      }
      await db
        .update(schema.outbox)
        .set({ sentAt: new Date(), attempts: row.attempts + 1, payload: redactPayload(p) })
        .where(eq(schema.outbox.id, row.id));
      sent++;
    } catch (err) {
      await db
        .update(schema.outbox)
        .set({ attempts: row.attempts + 1, lastError: String((err as Error).message).slice(0, 500) })
        .where(eq(schema.outbox.id, row.id));
    }
  }
  return sent;
}

/** Vendor confirm SLA (plan section 7): reminder after 12 hours unconfirmed. */
export async function slaReminders(db: Database, now = new Date()): Promise<number> {
  const rows = await db
    .select({ f: schema.fulfilments, ref: schema.orders.ref })
    .from(schema.fulfilments)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.fulfilments.orderId))
    .where(
      and(
        eq(schema.fulfilments.status, 'awaiting_confirmation'),
        eq(schema.fulfilments.kind, 'vendor'),
        eq(schema.orders.status, 'paid'),
        lt(schema.orders.paidAt, new Date(now.getTime() - 12 * 3_600_000)),
      ),
    );
  for (const { f, ref } of rows) {
    await enqueue(
      db,
      'notify.vendor',
      { to: f.vendorId!, template: 'vendor_sla_reminder', data: { ref, channels: ['sms', 'email'] } },
      `sla12:${f.id}`,
    );
  }
  return rows.length;
}

/** NFR-REL-03: ask the provider about orders pending for more than 10 minutes. */
export async function reconcilePayments(
  db: Database,
  provider: PaymentProvider,
  now = new Date(),
): Promise<number> {
  const rows = await db
    .select({ ref: schema.orders.ref })
    .from(schema.orders)
    .where(
      and(
        inArray(schema.orders.status, ['pending_payment', 'expired']),
        lt(schema.orders.createdAt, new Date(now.getTime() - 10 * 60_000)),
        gt(schema.orders.createdAt, new Date(now.getTime() - 2 * 86_400_000)),
      ),
    );
  let n = 0;
  for (const { ref } of rows) {
    const v = await provider.verify(ref).catch(() => null);
    if (v?.status === 'success') {
      const outcome = await processPaymentSuccess(db, provider, {
        reference: ref,
        amountKobo: v.amountKobo,
        currency: v.currency,
        channel: v.channel,
      });
      if (outcome !== 'duplicate') n++;
    }
  }
  return n;
}
