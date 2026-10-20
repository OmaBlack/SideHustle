import { sql } from 'drizzle-orm';
import { bigint, customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/** UUIDv7 primary key, generated in the app (Postgres 16 has no built-in uuidv7). */
export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
};

export const softDelete = { deletedAt: timestamp({ withTimezone: true }) };

/** Integer kobo. Read back as a JS number; values stay inside Number.MAX_SAFE_INTEGER (~₦90 trillion). */
export const kobo = (name?: string) => (name ? bigint(name, { mode: 'number' }) : bigint({ mode: 'number' }));

export const citext = customType<{ data: string }>({ dataType: () => 'citext' });

export const tstz = () => timestamp({ withTimezone: true });
