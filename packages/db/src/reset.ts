import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/**
 * Drops everything the migrations created. drizzle-kit has no down migrations,
 * so "down" is drop-and-reapply; CI runs migrate → reset → migrate to prove it.
 */
export async function resetDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(
      `DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await resetDatabase();
  console.log('database reset');
}
