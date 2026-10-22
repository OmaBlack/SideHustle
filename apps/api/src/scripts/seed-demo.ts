/**
 * Demo accounts for local development and staging (never production):
 * an admin, the owner of the seeded Luxe Leather Label vendor, and a
 * verified buyer. Password: DEMO_PASSWORD, default "sidehustle-demo".
 */
import { createDb, schema } from '@sidehustle/db';
import { seedId } from '@sidehustle/db/seed';
import { hashPassword } from '../lib/password.js';

export const DEMO_USERS = [
  { email: 'admin@sidehustle.test', name: 'Ada Admin', phone: '+2348000000001', role: 'admin' as const },
  {
    email: 'vendor@sidehustle.test',
    name: 'Tobi Luxe',
    phone: '+2348000000002',
    role: 'vendor_staff' as const,
    vendor: 'luxe',
  },
  {
    email: 'buyer@sidehustle.test',
    name: 'Bisi Buyer',
    phone: '+2348000000003',
    role: 'buyer' as const,
    businessName: 'Bisi Beauty',
  },
];

export async function seedDemo(
  db: ReturnType<typeof createDb>['db'],
  password = process.env.DEMO_PASSWORD ?? 'sidehustle-demo',
) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to create demo accounts in production');
  const passwordHash = await hashPassword(password);
  for (const u of DEMO_USERS) {
    const [row] = await db
      .insert(schema.users)
      .values({
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        state: 'Lagos',
        businessName: 'businessName' in u ? u.businessName : null,
        passwordHash,
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
      })
      .onConflictDoUpdate({ target: schema.users.email, set: { passwordHash, role: u.role } })
      .returning();
    if ('vendor' in u && u.vendor) {
      await db
        .insert(schema.vendorStaff)
        .values({ vendorId: seedId('vendor', u.vendor), userId: row!.id, role: 'owner' })
        .onConflictDoNothing();
    }
  }
}

if (process.argv[1]?.endsWith('seed-demo.ts')) {
  const { db, close } = createDb();
  await seedDemo(db);
  await close();
  console.log(`demo users: ${DEMO_USERS.map((u) => u.email).join(', ')}`);
}
