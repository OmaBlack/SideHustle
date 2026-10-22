import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate.js';
import { resetDatabase } from '../src/reset.js';
import * as s from '../src/schema/index.js';
import { applySeed, buildSeed, seedId } from '../src/seed/index.js';
import { freshDb, hasDb, TEST_DATABASE_URL } from './db.js';

const cause = (e: unknown): string => {
  const err = e as { message?: string; cause?: { message?: string } };
  return `${err.message ?? ''} ${err.cause?.message ?? ''}`;
};

describe.skipIf(!hasDb)('schema v1 (ticket 0.4)', () => {
  let conn: Awaited<ReturnType<typeof freshDb>>;
  beforeAll(async () => {
    conn = await freshDb();
    await applySeed(conn.db, buildSeed());
  });
  afterAll(() => conn?.close());

  const vendor = seedId('vendor', 'arewa');
  const beauty = seedId('category', 'beauty');
  const shea = seedId('product', 'shea');

  it('migrations go down (reset) and up again cleanly, and re-running them is a no-op', async () => {
    await conn.close();
    await resetDatabase(TEST_DATABASE_URL);
    await runMigrations(TEST_DATABASE_URL);
    await runMigrations(TEST_DATABASE_URL);
    conn = await freshDb();
    await applySeed(conn.db, buildSeed());
    const tables = await conn.db.execute<{ n: number }>(
      sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(tables[0]!.n).toBe(44);
  });

  describe('deal constraints', () => {
    const base = { vendorId: vendor, categoryId: beauty, headline: 'Shea week', endsOn: '2026-10-31' };
    it('accepts a valid product promo and a launch without an end date', async () => {
      await conn.db
        .insert(s.deals)
        .values({ ...base, kind: 'promo', scope: 'product', productId: shea, discountPct: 20 });
      await conn.db
        .insert(s.deals)
        .values({ ...base, kind: 'launch', scope: 'category', discountPct: 0, endsOn: null });
    });
    it.each([
      [
        'a launch with a discount',
        { kind: 'launch', scope: 'category', discountPct: 10 },
        'deals_kind_discount',
      ],
      ['a promo above 90%', { kind: 'promo', scope: 'category', discountPct: 91 }, 'deals_kind_discount'],
      [
        'a product deal without a product',
        { kind: 'promo', scope: 'product', discountPct: 10 },
        'deals_scope_product',
      ],
      [
        'a category deal with a product',
        { kind: 'promo', scope: 'category', productId: shea, discountPct: 10 },
        'deals_scope_product',
      ],
      [
        'a 61-character headline',
        { kind: 'promo', scope: 'category', discountPct: 10, headline: 'x'.repeat(61) },
        'deals_headline_length',
      ],
      [
        'a promo with no end date',
        { kind: 'promo', scope: 'category', discountPct: 10, endsOn: null },
        'deals_promo_end',
      ],
    ] as const)('rejects %s', async (_label, over, constraint) => {
      await expect(
        conn.db.insert(s.deals).values({ ...base, ...over } as typeof s.deals.$inferInsert),
      ).rejects.toSatisfy((e) => cause(e).includes(constraint));
    });
  });

  it('rejects negative money', async () => {
    await expect(
      conn.db.insert(s.products).values({
        slug: 'neg',
        vendorId: vendor,
        categoryId: beauty,
        name: 'Bad',
        unit: 'x',
        costKobo: -1,
        rrpKobo: 0,
      }),
    ).rejects.toSatisfy((e) => cause(e).includes('products_cost_nonneg'));
  });

  describe('orders', () => {
    async function makeOrder(ref: string, quoteId?: string) {
      const [u] = await conn.db
        .insert(s.users)
        .values({
          name: 'Ada',
          email: `${ref}@example.com`,
          phone: `+234${ref.replace(/\D/g, '').padEnd(10, '0')}`,
          passwordHash: 'x',
        })
        .returning();
      const qid =
        quoteId ??
        (
          await conn.db
            .insert(s.checkoutQuotes)
            .values({ userId: u!.id, payload: {}, totalKobo: 100, expiresAt: new Date(Date.now() + 9e5) })
            .returning()
        )[0]!.id;
      return conn.db
        .insert(s.orders)
        .values({
          ref,
          buyerId: u!.id,
          quoteId: qid,
          subtotalKobo: 100,
          totalKobo: 100,
          deliveryMethod: 'pickup',
          recipient: 'Ada',
          phone: '+2348000000000',
          expiresAt: new Date(Date.now() + 18e5),
        })
        .returning();
    }

    it('allows one order per quote (FR-CHK-07)', async () => {
      const [o] = await makeOrder('SH-AAAA0001');
      await expect(makeOrder('SH-AAAA0002', o!.quoteId)).rejects.toSatisfy((e) =>
        cause(e).includes('orders_quote_key'),
      );
    });

    it('requires total = subtotal − discount + delivery (BR-09)', async () => {
      const [o] = await makeOrder('SH-AAAA0003');
      await expect(
        conn.db
          .update(s.orders)
          .set({ totalKobo: 1 })
          .where(sql`${s.orders.id} = ${o!.id}`),
      ).rejects.toSatisfy((e) => cause(e).includes('orders_total_matches'));
    });
  });

  describe('ledger', () => {
    it('commits a balanced journal', async () => {
      await conn.db.transaction(async (tx) => {
        const [j] = await tx.insert(s.ledgerJournals).values({ kind: 'payment' }).returning();
        await tx.insert(s.ledgerEntries).values([
          { journalId: j!.id, account: 'buyer_clearing', amountKobo: -12_500_000 },
          { journalId: j!.id, account: 'vendor_payable', vendorId: vendor, amountKobo: 12_500_000 },
        ]);
      });
    });

    it('rejects an unbalanced journal at commit', async () => {
      await expect(
        conn.db.transaction(async (tx) => {
          const [j] = await tx.insert(s.ledgerJournals).values({ kind: 'payment' }).returning();
          await tx
            .insert(s.ledgerEntries)
            .values([{ journalId: j!.id, account: 'buyer_clearing', amountKobo: -100 }]);
        }),
      ).rejects.toSatisfy((e) => cause(e).includes('does not balance'));
    });

    it('is append-only', async () => {
      await expect(conn.db.update(s.ledgerEntries).set({ amountKobo: 0 })).rejects.toSatisfy((e) =>
        cause(e).includes('append-only'),
      );
      await expect(conn.db.delete(s.ledgerJournals)).rejects.toSatisfy((e) =>
        cause(e).includes('append-only'),
      );
    });
  });

  it('the app role cannot rewrite the audit log', async () => {
    await conn.db.insert(s.auditLog).values({ action: 'test', entity: 'x', entityId: '1' });
    await expect(
      conn.db.transaction(async (tx) => {
        await tx.execute(sql`set local role sidehustle_app`);
        await tx.execute(sql`update audit_log set action = 'tampered'`);
      }),
    ).rejects.toSatisfy((e) => cause(e).includes('permission denied'));
    const ok = await conn.db.transaction(async (tx) => {
      await tx.execute(sql`set local role sidehustle_app`);
      return tx.execute(sql`select count(*)::int as n from audit_log`);
    });
    expect(ok[0]!.n).toBe(1);
  });

  it('derives hub stock levels from the movement log', async () => {
    await conn.db.insert(s.hubStock).values({ productId: shea, lowStockThreshold: 5 });
    await conn.db.insert(s.hubStockMovements).values([
      { productId: shea, kind: 'receipt', qty: 100 },
      { productId: shea, kind: 'reservation', qty: -20 },
      { productId: shea, kind: 'release', qty: 20 },
      { productId: shea, kind: 'dispatch', qty: -20 },
      { productId: shea, kind: 'reservation', qty: -10 },
    ]);
    const [row] = await conn.db.execute<{ on_hand: number; available: number }>(
      sql`select on_hand, available from hub_stock_levels where product_id = ${shea}`,
    );
    expect(row).toEqual({ on_hand: 80, available: 70 });
  });

  describe('append-only enforcement for the connecting (owner) role', () => {
    it('rejects updating or deleting audit_log rows', async () => {
      await conn.db.insert(s.auditLog).values({ action: 'owner-test', entity: 'x', entityId: '2' });
      await expect(conn.db.execute(sql`update audit_log set action = 'tampered'`)).rejects.toSatisfy((e) =>
        cause(e).includes('append-only'),
      );
      await expect(conn.db.execute(sql`delete from audit_log`)).rejects.toSatisfy((e) =>
        cause(e).includes('append-only'),
      );
    });

    it.each(['audit_log', 'ledger_entries', 'hub_stock_movements'])(
      'rejects TRUNCATE on %s',
      async (table) => {
        await expect(conn.db.execute(sql.raw(`truncate ${table}`))).rejects.toSatisfy((e) =>
          cause(e).includes('append-only'),
        );
      },
    );
  });

  it('grants tables created by later migrations to the app role', async () => {
    await expect(
      conn.db.transaction(async (tx) => {
        await tx.execute(sql`create table zz_grant_probe (id int)`);
        await tx.execute(sql`set local role sidehustle_app`);
        await tx.execute(sql`insert into zz_grant_probe values (1)`);
        throw new Error('rollback probe');
      }),
    ).rejects.toThrow('rollback probe');
  });
});
