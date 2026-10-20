import { createDb } from '../src/client.js';
import { runMigrations } from '../src/migrate.js';
import { resetDatabase } from '../src/reset.js';

/** Integration tests need a throwaway Postgres 16. CI provides one; locally use `docker compose up postgres`. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasDb = !!TEST_DATABASE_URL;

export async function freshDb() {
  await resetDatabase(TEST_DATABASE_URL);
  await runMigrations(TEST_DATABASE_URL);
  return createDb(TEST_DATABASE_URL, { max: 4 });
}
