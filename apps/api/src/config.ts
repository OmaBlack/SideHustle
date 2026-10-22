import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Deployment tier. Staging and production refuse DEV_TOOLS. */
  APP_ENV: z.enum(['local', 'ci', 'staging', 'production']).default('local'),
  /** Local-only shortcuts: echo OTP codes and email links, enable the dev payment provider. */
  DEV_TOOLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Per-dependency cap for GET /v1/health, so an outage answers 503 instead of hanging. */
  HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  APP_VERSION: z.string().default('dev'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  /** Paystack test or live secret. Empty = the dev payment provider (never in production). */
  PAYSTACK_SECRET_KEY: z.string().default(''),
  /**
   * Which peers may set X-Forwarded-For. `false` (default) trusts none; `true` trusts every hop (only safe when the
   * API is unreachable except through the proxy); otherwise a comma-separated list of IPs/CIDRs of the web tier,
   * e.g. `10.0.0.0/8`, so a spoofed header from anyone else is ignored and rate limits see the real client IP.
   */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v): boolean | string[] => {
      const t = v.trim();
      if (t === '' || t === 'false') return false;
      if (t === 'true') return true;
      return t
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }),
  RATE_LIMIT_SCALE: z.coerce.number().int().min(1).default(1),
  /** Off only for local http development; production always sets Secure cookies. */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.RATE_LIMIT_SCALE !== 1) {
    throw new Error('Invalid environment: RATE_LIMIT_SCALE must be 1 in production');
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.PAYSTACK_SECRET_KEY) {
    throw new Error('Invalid environment: PAYSTACK_SECRET_KEY is required in production');
  }
  if (
    parsed.data.DEV_TOOLS &&
    (parsed.data.NODE_ENV === 'production' || ['staging', 'production'].includes(parsed.data.APP_ENV))
  ) {
    throw new Error('Invalid environment: DEV_TOOLS must be false in production and staging');
  }
  return parsed.data;
}
