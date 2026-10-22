import { schema } from '@sidehustle/db';
import type { Tx } from './db.js';

/** FR-ADM-06: every admin action is written to the append-only audit log in the same transaction. */
export async function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  diff?: unknown,
) {
  await tx.insert(schema.auditLog).values({ actorId, action, entity, entityId, diff: diff ?? null });
}
