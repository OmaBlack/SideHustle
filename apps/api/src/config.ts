import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_VERSION: z.string().default('dev'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  /** Paystack test or live secret. Empty = the dev payment provider (never in production). */
  PAYSTACK_SECRET_KEY: z.string().default(''),
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
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.PAYSTACK_SECRET_KEY) {
    throw new Error('Invalid environment: PAYSTACK_SECRET_KEY is required in production');
  }
  return parsed.data;
}
