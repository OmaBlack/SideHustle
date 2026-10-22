import { schema } from '@sidehustle/db';
import {
  LoginInput,
  OtpVerifyInput,
  PasswordResetConfirm,
  PasswordResetRequest,
  SignupInput,
  TokenInput,
  toE164,
} from '@sidehustle/schemas';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { HttpProblem } from '../../errors.js';
import { clearSessionCookies, requireUser, revokeSession, startSession } from '../../lib/auth.js';
import { randomToken, sha256, sixDigitCode } from '../../lib/crypto.js';
import { enqueue } from '../../lib/outbox.js';
import { dummyHash, hashPassword, verifyPassword } from '../../lib/password.js';
import { notFound } from '../../lib/problems.js';
import { rateLimit } from '../../lib/ratelimit.js';
import { minutesFromNow } from '../../lib/time.js';
import { loadMe } from './service.js';

const POLICY_VERSION = '2026-10';

export const identityRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, redis } = app.deps;
  // Codes are echoed back only when no real SMS/email provider is wired, so local testing works (never in production).
  const echoCodes = app.deps.config.DEV_TOOLS;

  const me = (userId: string) => loadMe(db, userId);

  app.post('/auth/signup', { schema: { tags: ['identity'], body: SignupInput } }, async (req, reply) => {
    await rateLimit(redis, 'signup', req.ip);
    const b = req.body;
    const phone = toE164(b.phone);
    if (!phone) {
      throw new HttpProblem(400, 'VALIDATION_FAILED', 'Some fields are not valid', undefined, {
        fields: { phone: 'Enter a Nigerian mobile number, like 0801 234 5678' },
      });
    }
    const clash = await db
      .select({ email: schema.users.email, phone: schema.users.phone })
      .from(schema.users)
      .where(or(eq(schema.users.email, b.email), eq(schema.users.phone, phone)));
    if (clash.length) {
      const fields: Record<string, string> = {};
      if (clash.some((c) => c.email.toLowerCase() === b.email))
        fields.email = 'An account already uses this email';
      if (clash.some((c) => c.phone === phone)) fields.phone = 'An account already uses this phone number';
      throw new HttpProblem(409, 'ACCOUNT_EXISTS', 'An account already exists', undefined, { fields });
    }
    const passwordHash = await hashPassword(b.password);
    const user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(schema.users)
        .values({
          name: b.name,
          businessName: b.businessName || null,
          email: b.email,
          phone,
          state: b.state,
          interests: b.interests,
          passwordHash,
        })
        .returning();
      await tx
        .insert(schema.consents)
        .values([
          { userId: u!.id, purpose: 'processing', policyVersion: POLICY_VERSION },
          ...(b.marketing ? [{ userId: u!.id, purpose: 'marketing', policyVersion: POLICY_VERSION }] : []),
        ]);
      return u!;
    });
    await startSession(app, req, reply, user.id);
    return reply.status(201).send({ user: await me(user.id) });
  });

  app.post('/auth/login', { schema: { tags: ['identity'], body: LoginInput } }, async (req, reply) => {
    await rateLimit(redis, 'login', `${req.ip}:${req.body.email}`);
    const [u] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, req.body.email), isNull(schema.users.deletedAt)));
    const ok = await verifyPassword(u?.passwordHash ?? (await dummyHash()), req.body.password);
    if (!u || !ok) throw new HttpProblem(401, 'BAD_CREDENTIALS', 'Email or password is not right');
    await startSession(app, req, reply, u.id);
    return { user: await me(u.id) };
  });

  app.post('/auth/logout', { schema: { tags: ['identity'] } }, async (req, reply) => {
    if (req.auth) await revokeSession(app, req.auth.sessionId);
    clearSessionCookies(reply);
    return reply.status(204).send();
  });

  app.get('/me', { schema: { tags: ['identity'] } }, async (req) => {
    if (!req.auth) return { user: null };
    return { user: await me(req.auth.user.id) };
  });

  app.get('/me/sessions', { schema: { tags: ['identity'] } }, async (req) => {
    const u = requireUser(req);
    const rows = await db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, u.id),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(schema.sessions.lastSeenAt));
    return {
      sessions: rows.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        lastSeenAt: s.lastSeenAt,
        createdAt: s.createdAt,
        current: s.id === req.auth!.sessionId,
      })),
    };
  });

  app.delete(
    '/me/sessions/:id',
    { schema: { tags: ['identity'], params: z.object({ id: z.string().uuid() }) } },
    async (req, reply) => {
      const u = requireUser(req);
      const res = await db
        .update(schema.sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.sessions.id, req.params.id), eq(schema.sessions.userId, u.id)))
        .returning({ id: schema.sessions.id });
      if (!res.length) throw notFound('Session not found');
      return reply.status(204).send();
    },
  );

  // FR-ACC-04: phone by OTP and email by link before first checkout.
  app.post('/me/verify/phone/send', { schema: { tags: ['identity'] } }, async (req) => {
    const u = requireUser(req);
    if (u.phoneVerified) return { sent: false, alreadyVerified: true };
    await rateLimit(redis, 'otpSend', u.id);
    const code = sixDigitCode();
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.otpCodes)
        .values({ userId: u.id, phone: u.phone, codeHash: sha256(code), expiresAt: minutesFromNow(10) });
      await enqueue(tx, 'notify.user', { to: u.id, template: 'otp', data: { code, channels: ['sms'] } });
    });
    return { sent: true, ...(echoCodes ? { devCode: code } : {}) };
  });

  app.post('/me/verify/phone', { schema: { tags: ['identity'], body: OtpVerifyInput } }, async (req) => {
    const u = requireUser(req);
    await rateLimit(redis, 'otpVerify', u.id);
    const [otp] = await db
      .select()
      .from(schema.otpCodes)
      .where(
        and(
          eq(schema.otpCodes.userId, u.id),
          isNull(schema.otpCodes.consumedAt),
          gt(schema.otpCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(schema.otpCodes.createdAt))
      .limit(1);
    if (!otp || otp.attempts >= 5)
      throw new HttpProblem(400, 'OTP_EXPIRED', 'That code has expired. Send a new one.');
    if (otp.codeHash !== sha256(req.body.code)) {
      await db
        .update(schema.otpCodes)
        .set({ attempts: otp.attempts + 1 })
        .where(eq(schema.otpCodes.id, otp.id));
      throw new HttpProblem(400, 'OTP_WRONG', 'That code is not right', undefined, {
        fields: { code: 'That code is not right' },
      });
    }
    await db.transaction(async (tx) => {
      await tx.update(schema.otpCodes).set({ consumedAt: new Date() }).where(eq(schema.otpCodes.id, otp.id));
      await tx.update(schema.users).set({ phoneVerifiedAt: new Date() }).where(eq(schema.users.id, u.id));
    });
    return { user: await me(u.id) };
  });

  app.post('/me/verify/email/send', { schema: { tags: ['identity'] } }, async (req) => {
    const u = requireUser(req);
    if (u.emailVerified) return { sent: false, alreadyVerified: true };
    await rateLimit(redis, 'otpSend', `email:${u.id}`);
    const token = randomToken();
    const link = `${app.deps.config.WEB_ORIGIN}/verify?email_token=${token}`;
    await db.transaction(async (tx) => {
      await tx.insert(schema.emailTokens).values({
        userId: u.id,
        purpose: 'verify_email',
        tokenHash: sha256(token),
        expiresAt: minutesFromNow(24 * 60),
      });
      await enqueue(tx, 'notify.user', {
        to: u.id,
        template: 'verify_email',
        data: { link, channels: ['email'] },
      });
    });
    return { sent: true, ...(echoCodes ? { devToken: token } : {}) };
  });

  const consumeEmailToken = async (token: string, purpose: 'verify_email' | 'reset_password') => {
    const [row] = await db
      .select()
      .from(schema.emailTokens)
      .where(
        and(
          eq(schema.emailTokens.tokenHash, sha256(token)),
          eq(schema.emailTokens.purpose, purpose),
          isNull(schema.emailTokens.consumedAt),
          gt(schema.emailTokens.expiresAt, new Date()),
        ),
      );
    if (!row) throw new HttpProblem(400, 'TOKEN_INVALID', 'That link has expired or was already used');
    await db
      .update(schema.emailTokens)
      .set({ consumedAt: new Date() })
      .where(eq(schema.emailTokens.id, row.id));
    return row.userId;
  };

  // The link works without being logged in, so it can be opened on another device.
  app.post('/auth/verify-email', { schema: { tags: ['identity'], body: TokenInput } }, async (req) => {
    const userId = await consumeEmailToken(req.body.token, 'verify_email');
    await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, userId));
    return { verified: true };
  });

  app.post(
    '/auth/password-reset',
    { schema: { tags: ['identity'], body: PasswordResetRequest } },
    async (req) => {
      await rateLimit(redis, 'passwordReset', `${req.ip}:${req.body.email}`);
      const [u] = await db
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.email, req.body.email), isNull(schema.users.deletedAt)));
      let devToken: string | undefined;
      if (u) {
        const token = randomToken();
        devToken = token;
        const link = `${app.deps.config.WEB_ORIGIN}/login/reset?token=${token}`;
        await db.transaction(async (tx) => {
          await tx.insert(schema.emailTokens).values({
            userId: u.id,
            purpose: 'reset_password',
            tokenHash: sha256(token),
            expiresAt: minutesFromNow(60),
          });
          await enqueue(tx, 'notify.user', {
            to: u.id,
            template: 'password_reset',
            data: { link, channels: ['email'] },
          });
        });
      }
      // Same answer whether or not the email exists.
      return { sent: true, ...(echoCodes && devToken ? { devToken } : {}) };
    },
  );

  app.post(
    '/auth/password-reset/confirm',
    { schema: { tags: ['identity'], body: PasswordResetConfirm } },
    async (req) => {
      const userId = await consumeEmailToken(req.body.token, 'reset_password');
      const passwordHash = await hashPassword(req.body.password);
      await db.transaction(async (tx) => {
        await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, userId));
        // A reset signs out every device.
        await tx
          .update(schema.sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
      });
      return { reset: true };
    },
  );
};
