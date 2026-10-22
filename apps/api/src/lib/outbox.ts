import { schema } from '@sidehustle/db';
import type { Tx } from './db.js';

export type OutboxTopic = 'notify.user' | 'notify.vendor';

export interface NotifyPayload {
  /** User (buyer) or vendor id, per topic. */
  to: string;
  template: string;
  data: Record<string, unknown>;
}

/**
 * Writes a message in the caller's transaction (NFR-REL-03). The dedupe key
 * makes a replayed webhook a no-op instead of a second SMS (AC-08).
 */
export async function enqueue(tx: Tx, topic: OutboxTopic, payload: NotifyPayload, dedupeKey?: string) {
  await tx
    .insert(schema.outbox)
    .values({ topic, payload, dedupeKey: dedupeKey ?? null })
    .onConflictDoNothing({ target: schema.outbox.dedupeKey });
}
