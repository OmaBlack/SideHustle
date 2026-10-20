/**
 * Second entrypoint of the API package (plan section 1): BullMQ consumers and
 * repeatable jobs, sharing module code with the HTTP server. Phase 0 only
 * proves the process boots and processes a job; order expiry, reconciliation
 * and notifications arrive in ticket 2.6.
 */
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';

const env = z
  .object({
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    WORKER_HEARTBEAT_MS: z.coerce.number().default(60_000),
  })
  .parse(process.env);

export const QUEUES = { system: 'system' } as const;

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const system = new Queue(QUEUES.system, { connection });

const worker = new Worker(
  QUEUES.system,
  async (job) => {
    if (job.name === 'heartbeat') return { at: new Date().toISOString() };
    throw new Error(`Unknown job ${job.name}`);
  },
  { connection },
);

worker.on('ready', () =>
  console.log(JSON.stringify({ level: 'info', msg: 'worker ready', queues: Object.values(QUEUES) })),
);
worker.on('completed', (job) =>
  console.log(JSON.stringify({ level: 'info', msg: 'job completed', job: job.name, id: job.id })),
);
worker.on('failed', (job, err) =>
  console.error(
    JSON.stringify({ level: 'error', msg: 'job failed', job: job?.name, id: job?.id, err: err.message }),
  ),
);

await system.upsertJobScheduler('heartbeat', { every: env.WORKER_HEARTBEAT_MS }, { name: 'heartbeat' });

const shutdown = async () => {
  await worker.close();
  await system.close();
  await connection.quit();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
