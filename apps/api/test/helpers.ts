import { createDb, resetDatabase, runMigrations, schema } from '@sidehustle/db';
import { applySeed, buildSeed, seedId } from '@sidehustle/db/seed';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { DevProvider } from '../src/lib/payments/provider.js';

export const DATABASE_URL = process.env.TEST_DATABASE_URL;
export const REDIS_URL = process.env.TEST_REDIS_URL;
export const hasServices = !!DATABASE_URL && !!REDIS_URL;

export const ids = {
  vendor: (slug: string) => seedId('vendor', slug),
  product: (slug: string) => seedId('product', slug),
  kit: (slug: string) => seedId('kit', slug),
  category: (slug: string) => seedId('category', slug),
};

/** A fresh, seeded database and a built app. Call once per test file (files run one at a time). */
export async function setup() {
  await resetDatabase(DATABASE_URL);
  await runMigrations(DATABASE_URL);
  const conn = createDb(DATABASE_URL, { max: 6 });
  await applySeed(conn.db, buildSeed());
  const redis = new Redis(REDIS_URL!);
  await redis.flushdb();
  const config = loadConfig({
    NODE_ENV: 'test',
    DEV_TOOLS: 'true',
    DATABASE_URL,
    REDIS_URL,
    WEB_ORIGIN: 'http://web.test',
  });
  const payments = new DevProvider(config.WEB_ORIGIN);
  const app = await buildApp({ config, db: conn.db, redis, payments });
  await app.ready();
  return {
    app,
    db: conn.db,
    sql: conn.sql,
    redis,
    payments,
    close: async () => {
      await app.close();
      await conn.close();
      redis.disconnect();
    },
  };
}
export type Env = Awaited<ReturnType<typeof setup>>;

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A browser-like client: keeps cookies and sends the CSRF header on mutations. */
export class Client {
  cookies = new Map<string, string>();
  constructor(readonly env: Env) {}

  async req(method: Method, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await this.env.app.inject({
      method,
      url: `/v1${url}`,
      payload: body as never,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(method !== 'GET' && this.cookies.has('sh_csrf')
          ? { 'x-csrf-token': this.cookies.get('sh_csrf')! }
          : {}),
        ...headers,
      },
    });
    for (const c of res.cookies as { name: string; value: string; maxAge?: number; expires?: Date }[]) {
      if (!c.value || (c.expires && c.expires.getTime() < Date.now())) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return {
      status: res.statusCode,
      // Tests read whatever shape each route returns.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: res.body ? (safeJson(res.body) as any) : null,
      headers: res.headers,
    };
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, body?: unknown, headers?: Record<string, string>) =>
    this.req('POST', url, body ?? {}, headers);
  put = (url: string, body?: unknown) => this.req('PUT', url, body ?? {});
  patch = (url: string, body?: unknown) => this.req('PATCH', url, body ?? {});
  del = (url: string) => this.req('DELETE', url);
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

let n = 0;
export function newBuyer(over: Record<string, unknown> = {}) {
  n++;
  return {
    name: 'Test Buyer',
    businessName: 'Test Biz',
    phone: `0803${String(1_000_000 + n).slice(-7)}`,
    email: `buyer${n}-${Date.now()}@example.com`,
    state: 'Lagos',
    interests: ['beauty'],
    password: 'correct horse battery',
    acceptTerms: true,
    ...over,
  };
}

/** Signs up a buyer and marks phone and email verified (the OTP/link flows have their own tests). */
export async function verifiedBuyer(env: Env) {
  const c = new Client(env);
  // Test files sign up many buyers from one address; the limiter has its own test.
  await env.redis.del('rl:signup:127.0.0.1');
  const res = await c.post('/auth/signup', newBuyer());
  if (res.status !== 201) throw new Error(`signup failed ${res.status} ${JSON.stringify(res.body)}`);
  await env.db
    .update(schema.users)
    .set({ emailVerifiedAt: new Date(), phoneVerifiedAt: new Date() })
    .where(eq(schema.users.id, res.body.user.id));
  return { client: c, user: res.body.user as { id: string; email: string } };
}

/** Creates a user with a role, optionally on a vendor team, and logs them in. */
export async function staffUser(env: Env, opts: { role: 'admin' | 'vendor_staff'; vendorSlug?: string }) {
  const { client, user } = await verifiedBuyer(env);
  await env.db.update(schema.users).set({ role: opts.role }).where(eq(schema.users.id, user.id));
  if (opts.vendorSlug)
    await env.db
      .insert(schema.vendorStaff)
      .values({ vendorId: ids.vendor(opts.vendorSlug), userId: user.id, role: 'owner' });
  return { client, user };
}

export const PICKUP = { deliveryMethod: 'pickup', recipient: 'Test Buyer', phone: '08031234567' };

/** Quote, create the order, and pay it through the dev provider. */
export async function checkout(c: Client, body: Record<string, unknown> = PICKUP) {
  const q = await c.post('/checkout/quote', body);
  if (q.status !== 200) throw new Error(`quote failed ${q.status} ${JSON.stringify(q.body)}`);
  const o = await c.post(
    '/orders',
    { quoteId: q.body.quote.id },
    { 'idempotency-key': `key-${q.body.quote.id}` },
  );
  if (o.status !== 201) throw new Error(`order failed ${o.status} ${JSON.stringify(o.body)}`);
  return { quote: q.body.quote, order: o.body.order, payment: o.body.payment };
}

export async function pay(c: Client, ref: string) {
  const r = await c.post(`/payments/dev/${ref}/complete`);
  if (r.status !== 200) throw new Error(`pay failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.outcome as string;
}
