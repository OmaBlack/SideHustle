import type { Database } from '../client.js';
import * as s from '../schema/index.js';
import type { Seed } from './convert.js';

/** Inserts seed rows. Ids are deterministic, so running it twice is a no-op. */
export async function applySeed(db: Database, seed: Seed) {
  await db.transaction(async (tx) => {
    await tx.insert(s.categories).values(seed.categories).onConflictDoNothing();
    await tx.insert(s.vendors).values(seed.vendors).onConflictDoNothing();
    await tx.insert(s.products).values(seed.products).onConflictDoNothing();
    await tx.insert(s.kits).values(seed.kits).onConflictDoNothing();
    await tx.insert(s.kitItems).values(seed.kitItems).onConflictDoNothing();
    await tx.insert(s.kitExtras).values(seed.kitExtras).onConflictDoNothing();
    await tx.insert(s.bundleRules).values(seed.bundleRules).onConflictDoNothing();
    await tx.insert(s.deliveryMethods).values(seed.deliveryMethods).onConflictDoNothing();
    await tx.insert(s.restrictedItems).values(seed.restrictedItems).onConflictDoNothing();
    await tx.insert(s.commissionRules).values(seed.commissionRules).onConflictDoNothing();
    await tx.insert(s.payoutSettings).values(seed.payoutSettings).onConflictDoNothing();
    await tx.insert(s.appConfig).values(seed.appConfig).onConflictDoNothing();
  });
}
