import { schema } from '@sidehustle/db';
import { RetentionInput } from '@sidehustle/schemas';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { minimalPaymentPayload, runRetention } from '../src/modules/privacy/service.js';
import {
  checkout,
  Client,
  hasServices,
  ids,
  newBuyer,
  pay,
  setup,
  staffUser,
  verifiedBuyer,
  type Env,
} from './helpers.js';

describe('privacy rules without a database', () => {
  it('keeps only reconciliation fields from a provider payload', () => {
    const out = minimalPaymentPayload({
      event: 'charge.success',
      data: {
        reference: 'SH-1',
        amount: 100,
        currency: 'NGN',
        customer: { email: 'a@b.co' },
        authorization: { last4: '4081' },
      },
    });
    expect(out).toMatchObject({ reference: 'SH-1', amount: 100 });
    expect(JSON.stringify(out)).not.toContain('a@b.co');
    expect(JSON.stringify(out)).not.toContain('4081');
  });
  it('refuses retention below the legal minimum and unknown data types', () => {
    expect(RetentionInput.safeParse({ dataType: 'orders', retainDays: 365, action: 'archive' }).success).toBe(
      false,
    );
    expect(
      RetentionInput.safeParse({ dataType: 'orders', retainDays: 2190, action: 'archive' }).success,
    ).toBe(true);
    expect(RetentionInput.safeParse({ dataType: 'whatever', retainDays: 30, action: 'purge' }).success).toBe(
      false,
    );
    expect(
      RetentionInput.safeParse({ dataType: 'sessions', retainDays: 30, action: 'archive' }).success,
    ).toBe(false);
  });
});

describe.skipIf(!hasServices)('NDPA data subject rights and retention', () => {
  let env: Env;
  beforeAll(async () => {
    env = await setup();
  });
  afterAll(async () => env?.close());

  it('requires the 18+ confirmation at sign-up and records it', async () => {
    const c = new Client(env);
    await env.redis.del('rl:signup:127.0.0.1');
    const { ageConfirmed: _omit, ...noAge } = newBuyer();
    void _omit;
    const res = await c.post('/auth/signup', noAge);
    expect(res.status).toBe(400);
    expect(res.body.fields.ageConfirmed).toMatch(/18/);
    const ok = await c.post('/auth/signup', newBuyer());
    const consents = await env.db
      .select()
      .from(schema.consents)
      .where(eq(schema.consents.userId, ok.body.user.id));
    expect(consents.map((x) => x.purpose)).toContain('age_18_plus');
  });

  it('exports everything held about the person, without secrets', async () => {
    const { client, user } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('snack') });
    const { order } = await checkout(client);
    await pay(client, order.ref);
    const res = await client.get('/me/data-export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.profile.email).toBe(user.email);
    expect(res.body.orders[0]).toMatchObject({ ref: order.ref, status: 'paid' });
    expect(res.body.consents.length).toBeGreaterThan(0);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('argon2');
    expect(text).not.toMatch(/token_?hash|passwordHash/i);
    expect((await new Client(env).get('/me/data-export')).status).toBe(401);
  });

  it('corrects email and phone with a password check and asks to verify again', async () => {
    const { client } = await verifiedBuyer(env);
    expect((await client.put('/me/contact', { email: 'new@example.com', password: 'wrong' })).status).toBe(
      401,
    );
    const res = await client.put('/me/contact', {
      email: `new-${Date.now()}@example.com`,
      phone: '0809 111 2233',
      password: 'correct horse battery',
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      phone: '+2348091112233',
      emailVerified: false,
      phoneVerified: false,
    });
  });

  it('erases an account, keeps its finished orders anonymously, and frees the email', async () => {
    const b = newBuyer();
    const c = new Client(env);
    await env.redis.del('rl:signup:127.0.0.1');
    const signup = await c.post('/auth/signup', b);
    const userId = signup.body.user.id as string;
    await env.db
      .update(schema.users)
      .set({ emailVerifiedAt: new Date(), phoneVerifiedAt: new Date() })
      .where(eq(schema.users.id, userId));
    await c.post('/cart/lines', { kind: 'kit', kitId: ids.kit('home') });
    const { order } = await checkout(c);
    await pay(c, order.ref);
    // Active order blocks deletion.
    const blocked = await c.post('/me/delete', { password: b.password });
    expect(blocked.body.code).toBe('ACTIVE_ORDERS');
    await env.db.update(schema.orders).set({ status: 'completed' }).where(eq(schema.orders.ref, order.ref));
    expect((await c.post('/me/delete', { password: 'nope' })).status).toBe(401);
    const res = await c.post('/me/delete', { password: b.password });
    expect(res.body).toEqual({ deleted: true });
    expect((await c.get('/me')).body.user).toBeNull();
    const [u] = await env.db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(u).toMatchObject({ name: 'Deleted user', businessName: null, state: null });
    expect(u!.email).not.toBe(b.email);
    expect(u!.deletedAt).not.toBeNull();
    const [o] = await env.db.select().from(schema.orders).where(eq(schema.orders.ref, order.ref));
    expect(o).toBeTruthy();
    expect(
      (await env.db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId))).length,
    ).toBe(0);
    expect((await new Client(env).post('/auth/login', { email: b.email, password: b.password })).status).toBe(
      401,
    );
    await env.redis.del('rl:signup:127.0.0.1');
    expect(
      (await new Client(env).post('/auth/signup', { ...newBuyer(), email: b.email, phone: b.phone })).status,
    ).toBe(201);
    const auditRows = await env.db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, userId));
    expect(auditRows.map((r) => r.action)).toContain('account.erase');
  });

  it('refuses to erase a vendor team member until the vendor is handed over', async () => {
    const { client } = await staffUser(env, { role: 'vendor_staff', vendorSlug: 'luxe' });
    expect((await client.post('/me/delete', { password: 'correct horse battery' })).body.code).toBe(
      'VENDOR_ACCOUNT',
    );
  });

  it('runs retention: purges old sessions and archives old order delivery details, never below minimums', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('snack') });
    const { order } = await checkout(client);
    await env.db.execute(
      sql`update orders set created_at = now() - interval '7 years' where ref = ${order.ref}`,
    );
    await env.db.execute(
      sql`update sessions set revoked_at = now() - interval '200 days', last_seen_at = now() - interval '200 days'`,
    );
    // An admin can't make orders shorter than 6 years, even directly in the table.
    await env.db
      .update(schema.retentionPolicies)
      .set({ retainDays: 1 })
      .where(eq(schema.retentionPolicies.dataType, 'orders'));
    const out = await runRetention(env.db);
    expect(out.sessions).toBeGreaterThan(0);
    expect(out.orders).toBe(1);
    const [o] = await env.db.select().from(schema.orders).where(eq(schema.orders.ref, order.ref));
    expect(o).toMatchObject({ recipient: '[archived]', phone: '[archived]', address: null });
    const recent = await env.db
      .select()
      .from(schema.orders)
      .where(sql`created_at > now() - interval '1 day'`);
    expect(recent.every((r) => r.recipient !== '[archived]')).toBe(true);
    // The admin API enforces the same minimum.
    const admin = await staffUser(env, { role: 'admin' });
    const rows = (await admin.client.get('/admin/retention')).body.items;
    const orders = rows.find((r: { dataType: string }) => r.dataType === 'orders');
    expect(
      (
        await admin.client.put(`/admin/retention/${orders.id}`, {
          dataType: 'orders',
          retainDays: 30,
          action: 'archive',
        })
      ).status,
    ).toBe(400);
  });

  it('logs admin views of a buyer’s order details', async () => {
    const { client } = await verifiedBuyer(env);
    await client.post('/cart/lines', { kind: 'kit', kitId: ids.kit('snack') });
    const { order } = await checkout(client);
    const admin = await staffUser(env, { role: 'admin' });
    await admin.client.get(`/admin/orders/${order.ref}`);
    const rows = await env.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'order.view'));
    expect(rows.some((r) => r.entityId === order.id)).toBe(true);
  });
});
