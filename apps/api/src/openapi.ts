/**
 * Writes the OpenAPI document to stdout without a database or Redis, so CI can
 * diff it against the committed openapi.json (plan section 6, ticket 0.3).
 */
import type { Database } from '@sidehustle/db';
import type { Redis } from 'ioredis';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig({
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused@localhost/unused',
  APP_VERSION: '0.0.0',
});
const app = await buildApp({ config, db: {} as Database, redis: {} as Redis });
await app.ready();
process.stdout.write(JSON.stringify(app.swagger(), null, 2) + '\n');
await app.close();
