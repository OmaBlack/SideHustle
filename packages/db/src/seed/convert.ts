import { fromNaira } from '@sidehustle/pricing';
import { prototype, type RawCatalogue, type RawOption } from '@sidehustle/pricing/fixtures/prototype';
import type { StoredOption } from '../schema/catalogue.js';
import { seedId } from './ids.js';

/** Seed timestamp for "verified" vendors, fixed so reseeding is reproducible. */
const SEEDED_AT = new Date('2026-10-20T00:00:00Z');

export function convertStoredOption(o: RawOption): StoredOption {
  if (o.type === 'check') return { type: 'check', id: o.id, label: o.label, add_kobo: fromNaira(o.add) };
  return {
    type: 'select',
    id: o.id,
    label: o.label,
    values: o.values.map(([value, add]) => ({ value, add_kobo: fromNaira(add) })),
  };
}

/**
 * Ticket 0.5: the prototype's CATS, V, P, K and DELIVERY arrays as seed rows in
 * kobo. Pure, so it can be tested without a database. Placeholders for values
 * the SRS leaves open (commission, payout timing) are marked as such.
 */
export function buildSeed(src: RawCatalogue = prototype) {
  const cat = (slug: string) => seedId('category', slug);
  const ven = (slug: string) => seedId('vendor', slug);
  const prod = (slug: string) => seedId('product', slug);
  const kit = (slug: string) => seedId('kit', slug);

  const categories = src.categories.map((c, i) => ({
    id: cat(c.id),
    slug: c.id,
    name: c.name,
    iconKey: c.shape,
    sortOrder: (i + 1) * 10,
  }));

  const vendors = src.vendors.map((v) => ({
    id: ven(v.id),
    slug: v.id,
    name: v.name,
    categoryId: cat(v.cat),
    location: v.loc,
    originNote: v.area ?? null,
    sinceYear: v.since,
    leadTimeText: v.lead,
    shipsTo: v.ships,
    about: v.about,
    about2: v.about2 ?? null,
    tags: v.tags,
    acceptsCustom: !!v.custom,
    customNote: v.customNote ?? null,
    featured: !!v.featured,
    replyTimeText: v.reply,
    rating: v.rating.toFixed(1),
    ordersCount: v.orders,
    status: 'verified' as const,
    brandColor: v.color,
    kycStatus: 'approved' as const,
    verifiedAt: SEEDED_AT,
  }));

  const vendorName = new Map(src.vendors.map((v) => [v.id, v.name]));
  const products = src.products.map((p) => ({
    id: prod(p.id),
    slug: p.id,
    vendorId: ven(p.v),
    categoryId: cat(p.cat),
    name: p.name,
    unit: p.unit,
    costKobo: fromNaira(p.cost) as number,
    rrpKobo: fromNaira(p.rrp) as number,
    moq: p.moq,
    leadTimeText: p.lead,
    note: p.note ?? null,
    notePlaceholder: p.notePh ?? null,
    artKey: p.shape,
    status: 'active' as const,
    fulfilmentMode: 'drop_ship' as const,
    stockQty: null,
    options: (p.opts ?? []).map(convertStoredOption),
    searchText: [p.name, vendorName.get(p.v), p.cat].join(' '),
  }));

  // sort_order follows the prototype's array order (Skincare before Health Corner, plan section 4).
  const kits = src.kits.map((k, i) => ({
    id: kit(k.id),
    slug: k.id,
    categoryId: cat(k.cat),
    name: k.name,
    priceKobo: fromNaira(k.price) as number,
    tip: k.tip,
    status: 'active' as const,
    sortOrder: (i + 1) * 10,
    platformFunded: false,
  }));
  const kitItems = src.kits.flatMap((k) =>
    k.items.map(([p, qty], i) => ({ kitId: kit(k.id), productId: prod(p), qty, sort: i })),
  );
  const kitExtras = src.kits.flatMap((k) =>
    k.extras.map((label, i) => ({
      id: seedId('kit_extra', `${k.id}:${i}`),
      kitId: kit(k.id),
      label,
      sort: i,
    })),
  );

  const bundleRules = [
    {
      id: seedId('bundle_rule', 'global'),
      scope: 'global' as const,
      scopeId: null,
      minKobo: fromNaira(src.bundle.minNaira) as number,
      pct: src.bundle.pct,
    },
  ];

  const deliveryMethods = src.delivery.map((d, i) => ({
    id: seedId('delivery', d.id),
    code: d.id,
    name: d.name,
    feeKobo: fromNaira(d.fee) as number,
    etaText: d.eta,
    eligibleStates: d.id === 'lagos' ? ['Lagos'] : [],
    sortOrder: (i + 1) * 10,
  }));

  // Paracetamol needs a PCN Patent and Proprietary Medicine Vendor licence (prototype product note).
  const restrictedItems = [
    {
      id: seedId('restricted', 'paracetamol'),
      productId: prod('paracetamol'),
      categoryId: null,
      requiredLicence: 'PCN_PPMV',
    },
  ];

  // PLACEHOLDERS until SRS §11 items 5–8 are decided (plan section 13, item 2).
  const commissionRules = [
    { id: seedId('commission', 'global'), scope: 'global' as const, scopeId: null, rateBps: 1000 },
  ];
  const payoutSettings = [
    { id: seedId('payout', 'default'), vendorId: null, daysAfterDelivery: 3, holdbackBps: 0 },
  ];

  // Starting retention periods (FR-ADM-10). PLACEHOLDERS until SRS §11 item 7 is decided with legal advice;
  // the admin API refuses anything below each type's minimum (packages/schemas RETENTION_TYPES).
  const retentionPolicies = (
    [
      ['sessions', 90, 'purge'],
      ['auth_codes', 30, 'purge'],
      ['outbox', 30, 'purge'],
      ['notifications', 365, 'purge'],
      ['checkout_quotes', 30, 'purge'],
      ['idempotency_keys', 7, 'purge'],
      ['payment_payloads', 180, 'archive'],
      ['custom_requests', 730, 'archive'],
      ['orders', 2190, 'archive'],
    ] as const
  ).map(([dataType, retainDays, action]) => ({
    id: seedId('retention', dataType),
    dataType,
    retainDays,
    action,
  }));

  const appConfig = [
    { key: 'order_expiry_minutes', value: 30 },
    { key: 'quote_ttl_minutes', value: 15 },
    { key: 'slideshow_max_slides', value: 4 },
    { key: 'slideshow_max_deals', value: 2 },
    { key: 'promo_max_pct', value: 90 },
  ];

  return {
    categories,
    vendors,
    products,
    kits,
    kitItems,
    kitExtras,
    bundleRules,
    deliveryMethods,
    restrictedItems,
    commissionRules,
    payoutSettings,
    retentionPolicies,
    appConfig,
  };
}

export type Seed = ReturnType<typeof buildSeed>;
