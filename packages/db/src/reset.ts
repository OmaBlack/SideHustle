import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Reset drops every table, so only allow it on a disposable target: a local host or a
 * database named *_test. ALLOW_DB_RESET=1 overrides that, but never in production.
 */
export function assertResettable(url: string, env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database');
  if (env.ALLOW_DB_RESET === '1') return;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  const name = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (LOCAL_HOSTS.has(target.hostname) || name.endsWith('_test')) return;
  throw new Error(
    `Refusing to reset ${target.hostname}/${name}: not a local or *_test database. Set ALLOW_DB_RESET=1 to override.`,
  );
}

/**
 * Drops everything the migrations created. drizzle-kit has no down migrations,
 * so "down" is drop-and-reapply; CI runs migrate → reset → migrate to prove it.
 */
export async function resetDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  assertResettable(url);
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
