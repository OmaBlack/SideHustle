/**
 * Second entrypoint of the API package (plan section 1): BullMQ consumers and
 * repeatable jobs, sharing module code with the HTTP server. Ticket 2.6:
 * order expiry, payment reconciliation, vendor SLA reminders and the outbox.
 */
import { createDb } from '@sidehustle/db';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { defaultPaymentProvider } from './app.js';
import { loadConfig } from './config.js';
import { DevNotifier } from './lib/notifier.js';
import { drainOutbox, reconcilePayments, slaReminders } from './modules/notifications/service.js';
import { expireOrders } from './modules/orders/service.js';

const config = loadConfig();
const log = (level: string, msg: string, extra: object = {}) =>
  console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, msg, ...extra }));

export const QUEUES = { system: 'system' } as const;

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const system = new Queue(QUEUES.system, { connection });
const { db, close } = createDb(config.DATABASE_URL, { max: 4 });
const payments = defaultPaymentProvider(config);
// Termii and Resend adapters arrive with ticket 2.0's provider accounts; until then messages are logged.
const notifier = new DevNotifier((m) =>
  log('info', 'notification', {
    channel: m.channel,
    template: m.template,
    to: m.to.replace(/.(?=.{4})/g, '*'),
  }),
);

const JOBS: Record<string, () => Promise<unknown>> = {
  heartbeat: async () => ({ at: new Date().toISOString() }),
  'orders.expire': () => expireOrders(db),
  'outbox.drain': () => drainOutbox(db, notifier),
  'vendor.sla': () => slaReminders(db),
  'payments.reconcile': () => reconcilePayments(db, payments),
};

const worker = new Worker(
  QUEUES.system,
  async (job) => {
    const run = JOBS[job.name];
    if (!run) throw new Error(`Unknown job ${job.name}`);
    return run();
  },
  { connection },
);

worker.on('ready', () => log('info', 'worker ready', { queues: Object.values(QUEUES) }));
worker.on('completed', (job, result) => log('debug', 'job completed', { job: job.name, id: job.id, result }));
worker.on('failed', (job, err) =>
  log('error', 'job failed', { job: job?.name, id: job?.id, err: err.message }),
);

const every = {
  heartbeat: 60_000,
  'orders.expire': 60_000,
  'outbox.drain': 5_000,
  'vendor.sla': 15 * 60_000,
  'payments.reconcile': 15 * 60_000,
};
for (const [name, ms] of Object.entries(every)) {
  await system.upsertJobScheduler(
    name,
    { every: ms },
    { name, opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );
}

const shutdown = async () => {
  await worker.close();
  await system.close();
  await connection.quit();
  await close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
