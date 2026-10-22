import type { Redis } from 'ioredis';
import { HttpProblem } from '../errors.js';

export const LIMITS = {
  login: { max: 10, windowSec: 15 * 60 },
  signup: { max: 10, windowSec: 60 * 60 },
  otpSend: { max: 5, windowSec: 60 * 60 },
  otpVerify: { max: 10, windowSec: 15 * 60 },
  passwordReset: { max: 5, windowSec: 60 * 60 },
  checkoutQuote: { max: 60, windowSec: 10 * 60 },
  orderCreate: { max: 20, windowSec: 10 * 60 },
  requestSubmit: { max: 10, windowSec: 60 * 60 },
} as const;
export type LimitName = keyof typeof LIMITS;

/** Fixed-window limiter in Redis (plan section 10). Throws 429 with Retry-After once the window is spent. */
export async function rateLimit(redis: Redis, name: LimitName, key: string) {
  const { max, windowSec } = LIMITS[name];
  const k = `rl:${name}:${key}`;
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, windowSec);
  if (count > max) {
    const ttl = await redis.ttl(k);
    const err = new HttpProblem(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.');
    (err as HttpProblem & { retryAfter?: number }).retryAfter = ttl > 0 ? ttl : windowSec;
    throw err;
  }
}
