import { schema } from '@sidehustle/db';
import { ContactInput, DeleteAccountInput, toE164 } from '@sidehustle/schemas';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpProblem } from '../../errors.js';
import { audit } from '../../lib/audit.js';
import { clearSessionCookies, requireUser } from '../../lib/auth.js';
import { verifyPassword } from '../../lib/password.js';
import { rateLimit } from '../../lib/ratelimit.js';
import { loadMe } from '../identity/service.js';
import { eraseUser, exportUserData } from './service.js';

/** NDPA 2023 data subject rights: access and portability, rectification, erasure. */
export const privacyRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, redis } = app.deps;

  const checkPassword = async (userId: string, password: string) => {
    await rateLimit(redis, 'login', `confirm:${userId}`);
    const [u] = await db
      .select({ hash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!u || !(await verifyPassword(u.hash, password))) {
      throw new HttpProblem(401, 'BAD_CREDENTIALS', 'That password is not right', undefined, {
        fields: { password: 'That password is not right' },
      });
    }
  };

  // s.34/s.38: a download of everything held about the signed-in person, answered immediately.
  app.get('/me/data-export', { schema: { tags: ['privacy'] } }, async (req, reply) => {
    const u = requireUser(req);
    const data = await exportUserData(db, u.id);
    await db
      .insert(schema.dataRequests)
      .values({ userId: u.id, kind: 'export', status: 'done', completedAt: new Date() });
    await audit(db, u.id, 'account.export', 'user', u.id);
    return reply
      .header(
        'content-disposition',
        `attachment; filename="sidehustle-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      )
      .header('cache-control', 'no-store')
      .send(data);
  });

  // s.35: correct email or phone. The changed contact must be verified again before the next checkout.
  app.put('/me/contact', { schema: { tags: ['privacy'], body: ContactInput } }, async (req) => {
    const u = requireUser(req);
    await checkPassword(u.id, req.body.password);
    const phone = req.body.phone ? toE164(req.body.phone) : undefined;
    if (req.body.phone && !phone) {
      throw new HttpProblem(400, 'VALIDATION_FAILED', 'Some fields are not valid', undefined, {
        fields: { phone: 'Enter a Nigerian mobile number, like 0801 234 5678' },
      });
    }
    const clash = await db
      .select({ email: schema.users.email, phone: schema.users.phone })
      .from(schema.users)
      .where(
        and(
          ne(schema.users.id, u.id),
          isNull(schema.users.deletedAt),
          or(
            req.body.email ? eq(schema.users.email, req.body.email) : undefined,
            phone ? eq(schema.users.phone, phone) : undefined,
          ),
        ),
      );
    if (clash.length) {
      const fields: Record<string, string> = {};
      if (req.body.email && clash.some((c) => c.email.toLowerCase() === req.body.email))
        fields.email = 'An account already uses this email';
      if (phone && clash.some((c) => c.phone === phone))
        fields.phone = 'An account already uses this phone number';
      throw new HttpProblem(409, 'ACCOUNT_EXISTS', 'An account already exists', undefined, { fields });
    }
    const set: Partial<typeof schema.users.$inferInsert> = {};
    if (req.body.email && req.body.email !== u.email.toLowerCase())
      Object.assign(set, { email: req.body.email, emailVerifiedAt: null });
    if (phone && phone !== u.phone) Object.assign(set, { phone, phoneVerifiedAt: null });
    if (Object.keys(set).length) {
      await db.update(schema.users).set(set).where(eq(schema.users.id, u.id));
      await audit(db, u.id, 'account.contact_change', 'user', u.id, {
        email: !!set.email,
        phone: !!set.phone,
      });
    }
    return { user: await loadMe(db, u.id) };
  });

  // s.36: erase the account now, after a password check.
  app.post('/me/delete', { schema: { tags: ['privacy'], body: DeleteAccountInput } }, async (req, reply) => {
    const u = requireUser(req);
    await checkPassword(u.id, req.body.password);
    await eraseUser(db, u.id);
    clearSessionCookies(reply);
    return reply.status(200).send({ deleted: true });
  });
};
