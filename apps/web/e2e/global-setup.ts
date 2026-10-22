import { execSync } from 'node:child_process';
import { E2E_DATABASE_URL } from '../playwright.config';

/** Reset, migrate and seed the e2e database, then add the demo accounts the flows log in as. */
export default function globalSetup() {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: E2E_DATABASE_URL, NODE_ENV: 'test' };
  const run = (cmd: string) => execSync(cmd, { stdio: 'inherit', env, cwd: '../..' });
  run('pnpm --silent --filter @sidehustle/db db:reset');
  run('pnpm --silent --filter @sidehustle/db db:migrate');
  run('pnpm --silent --filter @sidehustle/db db:seed');
  run('pnpm --silent --filter @sidehustle/api db:seed:demo');
}
