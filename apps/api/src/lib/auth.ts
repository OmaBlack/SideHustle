import { schema } from '@sidehustle/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomToken, sha256 } from './crypto.js';
import { forbidden, unauthorized } from './problems.js';

export const SESSION_COOKIE = 'sh_session';
export const CSRF_COOKIE = 'sh_csrf';
const IDLE_MS = 30 * 60_000;
const ABSOLUTE_MS = 30 * 86_400_000;
const TOUCH_MS = 60_000;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'buyer' | 'vendor_staff' | 'admin';
  emailVerified: boolean;
  phoneVerified: boolean;
}
export interface AuthContext {
  user: AuthUser;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

function cookieOptions(app: FastifyInstance, httpOnly: boolean) {
  const secure = app.deps.config.COOKIE_SECURE ?? app.deps.config.NODE_ENV === 'production';
  return { path: '/', httpOnly, sameSite: 'lax' as const, secure, maxAge: ABSOLUTE_MS / 1000 };
}

/** Creates a session row and sets the session + CSRF cookies. Rotates: any session cookie already sent is revoked. */
export async function startSession(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  userId: string,
) {
  if (req.auth) await revokeSession(app, req.auth.sessionId);
  const token = randomToken();
  const now = Date.now();
  const [row] = await app.deps.db
    .insert(schema.sessions)
    .values({
      userId,
      tokenHash: sha256(token),
      userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
      ip: req.ip,
      expiresAt: new Date(now + ABSOLUTE_MS),
    })
    .returning({ id: schema.sessions.id });
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(app, true));
  reply.setCookie(CSRF_COOKIE, randomToken(16), cookieOptions(app, false));
  return row!.id;
}

export async function revokeSession(app: FastifyInstance, sessionId: string) {
  await app.deps.db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));
}

export function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Resolves the session cookie to a user on every request (30-minute idle and
 * 30-day absolute timeouts), and enforces a double-submit CSRF token on
 * mutations made with a session (plan section 10).
 */
export function registerAuth(app: FastifyInstance) {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req) => {
    req.auth = null;
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return;
    const now = new Date();
    const [row] = await app.deps.db
      .select({ s: schema.sessions, u: schema.users })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(
        and(
          eq(schema.sessions.tokenHash, sha256(token)),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, now),
          isNull(schema.users.deletedAt),
        ),
      );
    if (!row) return;
    if (now.getTime() - row.s.lastSeenAt.getTime() > IDLE_MS) {
      await revokeSession(app, row.s.id);
      return;
    }
    if (!SAFE.has(req.method)) {
      const sent = req.headers['x-csrf-token'];
      if (!sent || sent !== req.cookies[CSRF_COOKIE]) throw forbidden('Missing or invalid CSRF token');
    }
    if (now.getTime() - row.s.lastSeenAt.getTime() > TOUCH_MS) {
      await app.deps.db
        .update(schema.sessions)
        .set({ lastSeenAt: now })
        .where(eq(schema.sessions.id, row.s.id));
    }
    req.auth = {
      sessionId: row.s.id,
      user: {
        id: row.u.id,
        name: row.u.name,
        email: row.u.email,
        phone: row.u.phone,
        role: row.u.role,
        emailVerified: !!row.u.emailVerifiedAt,
        phoneVerified: !!row.u.phoneVerifiedAt,
      },
    };
  });
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.auth) throw unauthorized();
  return req.auth.user;
}

export function requireAdmin(req: FastifyRequest): AuthUser {
  const u = requireUser(req);
  if (u.role !== 'admin') throw forbidden();
  return u;
}

/**
 * FR-VP-01 / NFR-SEC-02: the vendor comes from the session, never from the
 * request, and every vendor query takes it as a required argument.
 */
export async function requireVendor(app: FastifyInstance, req: FastifyRequest) {
  const u = requireUser(req);
  const [row] = await app.deps.db
    .select({ vendor: schema.vendors, role: schema.vendorStaff.role })
    .from(schema.vendorStaff)
    .innerJoin(schema.vendors, eq(schema.vendors.id, schema.vendorStaff.vendorId))
    .where(and(eq(schema.vendorStaff.userId, u.id), isNull(schema.vendors.deletedAt)));
  if (!row) throw forbidden('You are not part of a vendor team');
  return { user: u, vendor: row.vendor, vendorId: row.vendor.id, staffRole: row.role };
}
