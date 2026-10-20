import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from './_shared.js';
import { notificationChannel, notificationStatus, retentionAction } from './enums.js';
import { users } from './identity.js';

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid().references(() => users.id),
    channel: notificationChannel().notNull(),
    template: text().notNull(),
    status: notificationStatus().notNull().default('queued'),
    payload: jsonb().notNull(),
    providerRef: text(),
    sentAt: tstz(),
    ...timestamps,
  },
  (t) => [index('notifications_user_idx').on(t.userId)],
);

/** Written in the same transaction as the state change; the worker drains it (NFR-REL-03). */
export const outbox = pgTable(
  'outbox',
  {
    id: id(),
    topic: text().notNull(),
    payload: jsonb().notNull(),
    /** Dedupe key so a replayed webhook cannot enqueue the same message twice (AC-08). */
    dedupeKey: text(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    createdAt: tstz().notNull().defaultNow(),
    sentAt: tstz(),
  },
  (t) => [
    index('outbox_unsent_idx')
      .on(t.createdAt)
      .where(sql`${t.sentAt} IS NULL`),
    uniqueIndex('outbox_dedupe_key').on(t.dedupeKey),
  ],
);

/** Append-only; the app role has no UPDATE/DELETE grant (migration 0002). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid().references(() => users.id),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text().notNull(),
    diff: jsonb(),
    at: tstz().notNull().defaultNow(),
  },
  (t) => [index('audit_log_entity_idx').on(t.entity, t.entityId)],
);

/** Slideshow size, order expiry minutes, quote TTL, feature flags (NFR-MNT-02). */
export const appConfig = pgTable('app_config', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedBy: uuid().references(() => users.id),
  ...timestamps,
});

export const retentionPolicies = pgTable(
  'retention_policies',
  {
    id: id(),
    dataType: text().notNull(),
    retainDays: integer().notNull(),
    action: retentionAction().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('retention_policies_type_key').on(t.dataType)],
);
