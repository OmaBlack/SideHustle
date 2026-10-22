import { schema } from '@sidehustle/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { DevProvider } from '../src/lib/payments/provider.js';
import { Client, DATABASE_URL, REDIS_URL, hasServices, newBuyer, setup, type Env } from './helpers.js';

describe.skipIf(!hasServices)('identity (FR-ACC-01..06)', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env?.close());

  it('signs up with a Nigerian phone, hashes with Argon2id and records consent', async () => {
    const c = new Client(env);
    const b = newBuyer({ phone: '0803 555 0101', marketing: true });
    const res = await c.post('/auth/signup', b);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: b.email,
      phone: '+2348035550101',
      emailVerified: false,
      phoneVerified: false,
    });
    const [u] = await env.db.select().from(schema.users).where(eq(schema.users.email, b.email));
    expect(u!.passwordHash).toMatch(/^\$argon2id\$/);
    const consents = await env.db.select().from(schema.consents).where(eq(schema.consents.userId, u!.id));
    expect(consents.map((x) => x.purpose).sort()).toEqual(['marketing', 'processing']);
    expect(c.cookies.has('sh_session')).toBe(true);
    expect((await c.get('/me')).body.user.email).toBe(b.email);
  });

  it('shows inline field errors for bad input and duplicates (FR-ACC-02)', async () => {
    const c = new Client(env);
    const bad = await c.post('/auth/signup', newBuyer({ phone: '12345', password: 'short' }));
    expect(bad.status).toBe(400);
    expect(bad.body.fields.password).toMatch(/8 characters/);
    const badPhone = await c.post('/auth/signup', newBuyer({ phone: '12345' }));
    expect(badPhone.body.fields.phone).toMatch(/Nigerian/);
    const b = newBuyer();
    await new Client(env).post('/auth/signup', b);
    const dup = await c.post('/auth/signup', { ...newBuyer(), email: b.email.toUpperCase(), phone: b.phone });
    expect(dup.status).toBe(409);
    expect(Object.keys(dup.body.fields).sort()).toEqual(['email', 'phone']);
  });

  it('logs in, refuses a wrong password, logs out, and lists and revokes sessions (FR-ACC-05)', async () => {
    const b = newBuyer();
    await new Client(env).post('/auth/signup', b);
    const c = new Client(env);
    expect((await c.post('/auth/login', { email: b.email, password: 'wrong password' })).status).toBe(401);
    expect((await c.post('/auth/login', { email: b.email, password: b.password })).status).toBe(200);
    const other = new Client(env);
    await other.post('/auth/login', { email: b.email, password: b.password });
    const list = await c.get('/me/sessions');
    expect(list.body.sessions.length).toBeGreaterThanOrEqual(2);
    const theirs = list.body.sessions.find((s: { current: boolean }) => !s.current);
    expect((await c.del(`/me/sessions/${theirs.id}`)).status).toBe(204);
    expect((await other.get('/me')).body.user).toBeNull();
    expect((await c.post('/auth/logout')).status).toBe(204);
    expect((await c.get('/me')).body.user).toBeNull();
  });

  it('rejects mutations without the CSRF token', async () => {
    const c = new Client(env);
    await c.post('/auth/signup', newBuyer());
    const res = await c.req('POST', '/cart/ack', {}, { 'x-csrf-token': 'nope' });
    expect(res.status).toBe(403);
  });

  it('verifies the phone by OTP and the email by link (FR-ACC-04)', async () => {
    const c = new Client(env);
    await c.post('/auth/signup', newBuyer());
    const sent = await c.post('/me/verify/phone/send');
    expect(sent.body.devCode).toMatch(/^\d{6}$/);
    const wrong = sent.body.devCode === '000000' ? '111111' : '000000';
    expect((await c.post('/me/verify/phone', { code: wrong })).status).toBe(400);
    const ok = await c.post('/me/verify/phone', { code: sent.body.devCode });
    expect(ok.body.user.phoneVerified).toBe(true);
    const email = await c.post('/me/verify/email/send');
    // The link works on another device without a session.
    expect((await new Client(env).post('/auth/verify-email', { token: email.body.devToken })).status).toBe(
      200,
    );
    expect((await c.get('/me')).body.user.emailVerified).toBe(true);
    expect((await new Client(env).post('/auth/verify-email', { token: email.body.devToken })).status).toBe(
      400,
    );
  });

  it('resets a password by email link and signs out every device', async () => {
    const b = newBuyer();
    const c = new Client(env);
    await c.post('/auth/signup', b);
    const r = await new Client(env).post('/auth/password-reset', { email: b.email });
    expect(
      (await new Client(env).post('/auth/password-reset', { email: 'nobody@example.com' })).body,
    ).toEqual({ sent: true });
    expect(
      (
        await new Client(env).post('/auth/password-reset/confirm', {
          token: r.body.devToken,
          password: 'a brand new password',
        })
      ).status,
    ).toBe(200);
    expect((await c.get('/me')).body.user).toBeNull();
    const fresh = new Client(env);
    expect(
      (await fresh.post('/auth/login', { email: b.email, password: 'a brand new password' })).status,
    ).toBe(200);
  });

  it('rate limits login attempts (NFR-SEC-04)', async () => {
    const c = new Client(env);
    let last = 0;
    for (let i = 0; i < 11; i++)
      last = (await c.post('/auth/login', { email: 'limit@example.com', password: 'x' })).status;
    expect(last).toBe(429);
  });

  it('applies a global per-IP ceiling to every route (NFR-SEC-04)', async () => {
    await env.redis.flushdb();
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL, REDIS_URL, WEB_ORIGIN: 'http://web.test' });
    const app = await buildApp({ config, db: env.db, redis: env.redis, payments: env.payments });
    await app.ready();
    try {
      let last;
      for (let i = 0; i < 301; i++) last = await app.inject({ method: 'GET', url: '/v1/categories' });
      expect(last!.statusCode).toBe(429);
      expect(last!.headers['content-type']).toContain('application/problem+json');
      expect(last!.json().code).toBe('RATE_LIMITED');
    } finally {
      await app.close();
      await env.redis.flushdb();
    }
  });

  it('returns no reset token or codes when DEV_TOOLS is off', async () => {
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL, REDIS_URL, WEB_ORIGIN: 'http://web.test' });
    expect(config.DEV_TOOLS).toBe(false);
    const app = await buildApp({
      config,
      db: env.db,
      redis: env.redis,
      payments: new DevProvider(config.WEB_ORIGIN),
    });
    await app.ready();
    try {
      const b = newBuyer();
      await env.redis.flushdb();
      await new Client(env).post('/auth/signup', b);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset',
        payload: { email: b.email },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().devToken).toBeUndefined();
    } finally {
      await app.close();
      await env.redis.flushdb();
    }
  });

  it('asks for login on protected routes (FR-ACC-06)', async () => {
    const c = new Client(env);
    expect((await c.get('/orders')).status).toBe(401);
    expect((await c.get('/cart')).body.code).toBe('UNAUTHENTICATED');
  });
});
