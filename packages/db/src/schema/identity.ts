import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { citext, id, softDelete, timestamps, tstz } from './_shared.js';
import { dataRequestKind, emailTokenPurpose, jobStatus, userRole } from './enums.js';

export const users = pgTable(
  'users',
  {
    id: id(),
    name: text().notNull(),
    email: citext().notNull(),
    /** E.164, e.g. +2348012345678 */
    phone: text().notNull(),
    passwordHash: text().notNull(),
    state: text(),
    businessName: text(),
    interests: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    role: userRole().notNull().default('buyer'),
    emailVerifiedAt: tstz(),
    phoneVerifiedAt: tstz(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex('users_email_key').on(t.email), uniqueIndex('users_phone_key').on(t.phone)],
);

/** Server sessions, looked up by a hash of the cookie token (plan section 1, Auth). */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    userAgent: text(),
    ip: text(),
    lastSeenAt: tstz().notNull().defaultNow(),
    expiresAt: tstz().notNull(),
    revokedAt: tstz(),
    ...timestamps,
  },
  (t) => [uniqueIndex('sessions_token_hash_key').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    phone: text().notNull(),
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: tstz().notNull(),
    consumedAt: tstz(),
    ...timestamps,
  },
  (t) => [index('otp_codes_user_idx').on(t.userId)],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailTokenPurpose().notNull(),
    tokenHash: text().notNull(),
    expiresAt: tstz().notNull(),
    consumedAt: tstz(),
    ...timestamps,
  },
  (t) => [uniqueIndex('email_tokens_token_hash_key').on(t.tokenHash)],
);

/** NDPA consent records (NFR-PRV-01). */
export const consents = pgTable(
  'consents',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text().notNull(),
    policyVersion: text().notNull(),
    grantedAt: tstz().notNull().defaultNow(),
    withdrawnAt: tstz(),
    ...timestamps,
  },
  (t) => [index('consents_user_idx').on(t.userId)],
);

/** Export and deletion requests (FR-ACC-08). */
export const dataRequests = pgTable('data_requests', {
  id: id(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  kind: dataRequestKind().notNull(),
  status: jobStatus().notNull().default('pending'),
  resultKey: text(),
  completedAt: tstz(),
  ...timestamps,
});
