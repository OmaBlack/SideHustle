import { createDb } from '../client.js';
import { applySeed } from './apply.js';
import { buildSeed } from './convert.js';

const { db, close } = createDb();
try {
  const seed = buildSeed();
  await applySeed(db, seed);
  console.log(
    `seeded ${seed.categories.length} categories, ${seed.vendors.length} vendors, ${seed.products.length} products, ${seed.kits.length} kits`,
  );
} finally {
  await close();
}
