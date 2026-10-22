import { schema, type Database } from '@sidehustle/db';
import { eq } from 'drizzle-orm';

/** The signed-in user as the web app sees it. */
export async function loadMe(db: Database, userId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const staff = await db
    .select({ vendorId: schema.vendorStaff.vendorId })
    .from(schema.vendorStaff)
    .where(eq(schema.vendorStaff.userId, userId));
  return {
    id: u!.id,
    name: u!.name,
    email: u!.email,
    phone: u!.phone,
    businessName: u!.businessName ?? '',
    state: u!.state,
    interests: u!.interests,
    role: u!.role,
    emailVerified: !!u!.emailVerifiedAt,
    phoneVerified: !!u!.phoneVerifiedAt,
    vendorId: staff[0]?.vendorId ?? null,
  };
}
