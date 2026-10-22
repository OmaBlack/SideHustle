import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.WEB_PORT ?? 3100);
const apiPort = Number(process.env.E2E_API_PORT ?? 4100);
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://sidehustle:sidehustle@localhost:5432/sidehustle_e2e';
const E2E_REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/7';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  // Fresh, seeded database with demo accounts (apps/api/src/scripts/seed-demo.ts).
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: 'mobile-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @sidehustle/api start',
      url: `http://localhost:${apiPort}/v1/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'development',
        DEV_TOOLS: 'true',
        DATABASE_URL: E2E_DATABASE_URL,
        REDIS_URL: E2E_REDIS_URL,
        PORT: String(apiPort),
        WEB_ORIGIN: `http://localhost:${port}`,
        TRUST_PROXY: 'true',
        RATE_LIMIT_SCALE: '50',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `pnpm next start --port ${port}`,
      port,
      reuseExistingServer: !process.env.CI,
      env: { API_ORIGIN: `http://localhost:${apiPort}` },
    },
  ],
});

export { E2E_DATABASE_URL };
