import { schema, type Database } from '@sidehustle/db';
import { cartTotals, kobo, optionAddOn, type CartTotals, type LineIssue } from '@sidehustle/pricing';
import type { CartLineInput } from '@sidehustle/schemas';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Tx } from '../../lib/db.js';
import {
  loadPricingContext,
  toPricingLine,
  type PricingContext,
  type StoredBundleItem,
  type StoredCartLine,
} from '../../lib/pricing.js';
import { badRequest } from '../../lib/problems.js';

export async function cartId(db: Tx, userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: schema.carts.id })
    .from(schema.carts)
    .where(eq(schema.carts.userId, userId));
  if (existing) return existing.id;
  const [row] = await db
    .insert(schema.carts)
    .values({ userId })
    .onConflictDoUpdate({ target: schema.carts.userId, set: { updatedAt: new Date() } })
    .returning({ id: schema.carts.id });
  return row!.id;
}

const canonical = (v: unknown) => JSON.stringify(v ?? {}, Object.keys((v ?? {}) as object).sort());

/** Lines whose product or kit can still be priced; the rest show as unavailable. */
function priceable(lines: StoredCartLine[], ctx: PricingContext) {
  const ok = (l: StoredCartLine) => {
    if (l.lineType === 'product') return ctx.catalogue.products.has(l.productId!);
    if (l.lineType === 'kit') return !!ctx.catalogue.kits?.has(l.kitId!);
    return ((l.items as StoredBundleItem[]) ?? []).every((i) => ctx.catalogue.products.has(i.productId));
  };
  return lines.filter(ok);
}

export interface PricedCart {
  totals: CartTotals;
  rows: StoredCartLine[];
  missing: StoredCartLine[];
}

export function priceLines(lines: StoredCartLine[], ctx: PricingContext, deliveryFeeKobo = 0): PricedCart {
  const rows = priceable(lines, ctx);
  const missing = lines.filter((l) => !rows.includes(l));
  const totals = cartTotals(rows.map(toPricingLine), {
    catalogue: ctx.catalogue,
    deals: ctx.deals,
    bundleRules: ctx.bundleRules,
    deliveryFeeKobo: kobo(deliveryFeeKobo),
    now: ctx.now,
  });
  return { totals, rows, missing };
}

export async function loadLines(db: Tx, userId: string) {
  const id = await cartId(db, userId);
  return db
    .select()
    .from(schema.cartLines)
    .where(eq(schema.cartLines.cartId, id))
    .orderBy(asc(schema.cartLines.createdAt), asc(schema.cartLines.id));
}

const issueText: Record<LineIssue['code'], string> = {
  BELOW_MOQ: 'Below the minimum order',
  OUT_OF_STOCK: 'Not enough stock',
  KIT_QTY: 'Kits are bought one at a time',
  KIT_UNAVAILABLE: 'Kit is out of stock',
};

/** FR-CART-03/05: per line name, vendor, options, minimum, unit price, quantity, total, and what changed. */
export async function cartView(db: Database, userId: string, ctx?: PricingContext) {
  const c = ctx ?? (await loadPricingContext(db));
  const lines = await loadLines(db, userId);
  const { totals, rows, missing } = priceLines(lines, c);
  const productIds = new Set<string>();
  const kitIds = new Set<string>();
  for (const l of lines) {
    if (l.productId) productIds.add(l.productId);
    if (l.kitId) kitIds.add(l.kitId);
    for (const i of (l.items as StoredBundleItem[] | null) ?? []) productIds.add(i.productId);
  }
  const products = productIds.size
    ? await db
        .select({ p: schema.products, v: schema.vendors, c: schema.categories })
        .from(schema.products)
        .innerJoin(schema.vendors, eq(schema.vendors.id, schema.products.vendorId))
        .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
        .where(inArray(schema.products.id, [...productIds]))
    : [];
  const kits = kitIds.size
    ? await db
        .select()
        .from(schema.kits)
        .where(inArray(schema.kits.id, [...kitIds]))
    : [];
  const pById = new Map(products.map((r) => [r.p.id, r]));
  const kById = new Map(kits.map((k) => [k.id, k]));

  const view = rows.map((l, i) => {
    const pl = totals.lines[i]!;
    const issues = totals.issues.filter((x) => x.index === i).map((x) => ({ ...x, text: issueText[x.code] }));
    const available = !issues.some((x) => x.code === 'OUT_OF_STOCK' || x.code === 'KIT_UNAVAILABLE');
    const base = {
      id: l.id,
      kind: l.lineType,
      qty: l.qty,
      unitKobo: pl.unitKobo,
      lineTotalKobo: pl.lineTotalKobo,
      discountKobo: pl.discountKobo,
      issues,
      available,
      changes: {
        price:
          l.seenUnitKobo != null && l.seenUnitKobo !== pl.unitKobo
            ? { fromKobo: l.seenUnitKobo, toKobo: pl.unitKobo }
            : null,
        availability: l.seenAvailable === true && !available,
      },
    };
    if (pl.kind === 'product') {
      const r = pById.get(l.productId!)!;
      return {
        ...base,
        name: r.p.name,
        slug: r.p.slug,
        unit: r.p.unit,
        artKey: r.p.artKey,
        category: r.c.slug,
        vendor: { name: r.v.name, slug: r.v.slug },
        moq: r.p.moq,
        optionText: pl.optionText,
        isCustom: pl.isCustom,
        note: l.note,
        customNote: pl.isCustom ? r.v.customNote : null,
        originalUnitKobo: pl.originalUnitKobo,
        discountPct: pl.discountPct,
      };
    }
    if (pl.kind === 'kit') {
      const k = kById.get(l.kitId!)!;
      return {
        ...base,
        name: k.name,
        slug: k.slug,
        units: pl.kit.units,
        productCount: pl.kit.productCount,
        profitKobo: pl.kit.profitKobo,
      };
    }
    return {
      ...base,
      name: l.name || 'Custom kit',
      itemCount: pl.bundle.units,
      productCount: pl.bundle.lines.length,
      vendorCount: pl.bundle.vendorCount,
      profitKobo: pl.bundle.profitKobo,
      items: pl.bundle.lines.map((bl) => ({
        name: pById.get(bl.productId)?.p.name ?? '',
        qty: bl.qty,
        unitKobo: bl.unitKobo,
      })),
    };
  });
  return {
    lines: [
      ...view,
      ...missing.map((l) => ({
        id: l.id,
        kind: l.lineType,
        qty: l.qty,
        name:
          l.lineType === 'kit'
            ? (kById.get(l.kitId!)?.name ?? 'Kit')
            : l.lineType === 'product'
              ? (pById.get(l.productId!)?.p.name ?? 'Product')
              : l.name || 'Custom kit',
        unitKobo: 0,
        lineTotalKobo: 0,
        discountKobo: 0,
        available: false,
        issues: [{ code: 'NO_LONGER_SOLD', text: 'No longer sold' }],
        changes: { price: null, availability: true },
      })),
    ],
    count: lines.length,
    subtotalKobo: totals.subtotalKobo,
    bundleDiscountKobo: totals.bundleDiscountKobo,
    totalKobo: totals.totalKobo,
    canCheckout: lines.length > 0 && totals.issues.length === 0 && missing.length === 0,
    hasChanges: view.some((l) => l.changes.price || l.changes.availability) || missing.length > 0,
  };
}

/** Records what the buyer has now seen, so the change flags clear (FR-CART-05). */
export async function acknowledge(db: Tx, userId: string, ctx: PricingContext, onlyIds?: readonly string[]) {
  const lines = await loadLines(db, userId);
  const { totals, rows } = priceLines(lines, ctx);
  await Promise.all(
    rows.map((l, i) => {
      if (onlyIds && !onlyIds.includes(l.id)) return null;
      const unavailable = totals.issues.some(
        (x) => x.index === i && (x.code === 'OUT_OF_STOCK' || x.code === 'KIT_UNAVAILABLE'),
      );
      return db
        .update(schema.cartLines)
        .set({ seenUnitKobo: totals.lines[i]!.unitKobo, seenAvailable: !unavailable })
        .where(eq(schema.cartLines.id, l.id));
    }),
  );
}

/** Adds a line, merging identical product lines (FR-CART-02). Invalid options are rejected before saving. */
export async function addLine(db: Tx, userId: string, input: CartLineInput, ctx: PricingContext) {
  const id = await cartId(db, userId);
  if (input.kind === 'product') {
    const p = ctx.catalogue.products.get(input.productId);
    if (!p) throw badRequest('UNKNOWN_PRODUCT', 'That product is not available');
    optionAddOn(p, input.selection, input.note);
    const existing = await db.select().from(schema.cartLines).where(eq(schema.cartLines.cartId, id));
    const same = existing.find(
      (l) =>
        l.lineType === 'product' &&
        l.productId === input.productId &&
        canonical(l.options) === canonical(input.selection) &&
        (l.note ?? '') === (input.note ?? ''),
    );
    if (same) {
      await db
        .update(schema.cartLines)
        .set({ qty: same.qty + input.qty })
        .where(eq(schema.cartLines.id, same.id));
      return same.id;
    }
    const [row] = await db
      .insert(schema.cartLines)
      .values({
        cartId: id,
        lineType: 'product',
        productId: input.productId,
        qty: input.qty,
        options: input.selection ?? null,
        note: input.note || null,
      })
      .returning({ id: schema.cartLines.id });
    return row!.id;
  }
  if (input.kind === 'kit') {
    if (!ctx.catalogue.kits?.has(input.kitId)) throw badRequest('UNKNOWN_KIT', 'That kit is not available');
    const [row] = await db
      .insert(schema.cartLines)
      .values({ cartId: id, lineType: 'kit', kitId: input.kitId, qty: 1 })
      .returning({ id: schema.cartLines.id });
    return row!.id;
  }
  for (const it of input.items) {
    const p = ctx.catalogue.products.get(it.productId);
    if (!p) throw badRequest('UNKNOWN_PRODUCT', 'A product in this kit is not available');
    optionAddOn(p, it.selection, it.note);
  }
  const [row] = await db
    .insert(schema.cartLines)
    .values({ cartId: id, lineType: 'bundle', name: input.name || null, items: input.items, qty: 1 })
    .returning({ id: schema.cartLines.id });
  return row!.id;
}
