import { createDb } from '@sidehustle/db';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type Deps } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const REDIS_URL = process.env.TEST_REDIS_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('GET /v1/health', () => {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL, REDIS_URL, APP_VERSION: '1.2.3' });
  const conn = createDb(config.DATABASE_URL, { max: 2 });
  const redis = new Redis(config.REDIS_URL);
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp({ config, db: conn.db, redis });
  });
  afterAll(async () => {
    await app.close();
    await conn.close();
    redis.disconnect();
  });

  it('reports ok with database and redis checks', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: '1.2.3', checks: { database: 'ok', redis: 'ok' } });
  });

  it('echoes a valid X-Request-Id and mints one otherwise', async () => {
    const a = await app.inject({ method: 'GET', url: '/v1/health', headers: { 'x-request-id': 'abc-123' } });
    expect(a.headers['x-request-id']).toBe('abc-123');
    const b = await app.inject({ method: 'GET', url: '/v1/health', headers: { 'x-request-id': 'bad id\n' } });
    expect(b.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('app without dependencies', () => {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://x@localhost/x' });
  const failing = {
    db: { execute: async () => Promise.reject(new Error('down')) },
    redis: { ping: async () => Promise.reject(new Error('down')) },
  };

  it('reports degraded with 503 when dependencies are down', async () => {
    const app = await buildApp({ config, ...(failing as unknown as Pick<Deps, 'db' | 'redis'>) });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().checks).toEqual({ database: 'fail', redis: 'fail' });
    await app.close();
  });

  it('returns RFC 7807 problems for unknown routes', async () => {
    const app = await buildApp({ config, ...(failing as unknown as Pick<Deps, 'db' | 'redis'>) });
    const res = await app.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await app.close();
  });

  it('serves an OpenAPI 3.1 document', async () => {
    const app = await buildApp({ config, ...(failing as unknown as Pick<Deps, 'db' | 'redis'>) });
    const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(res.json()).toMatchObject({
      openapi: '3.1.0',
      paths: { '/v1/health': { get: expect.any(Object) } },
    });
    await app.close();
  });

  it('rejects a bad environment with a readable message', () => {
    expect(() => loadConfig({ DATABASE_URL: 'nope' })).toThrow(/DATABASE_URL/);
  });
});
