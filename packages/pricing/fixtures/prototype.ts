/**
 * The prototype's catalogue converted to pricing inputs (kobo, `select`
 * options). Golden tests and the database seed both start from this file so
 * they cannot drift apart.
 */
import raw from './prototype-catalogue.json' with { type: 'json' };
import {
  fromNaira,
  type BundleRule,
  type PricingKit,
  type PricingProduct,
  type ProductOption,
} from '../src/index.js';

export type RawOption =
  | { id: string; label: string; type: 'check'; add: number }
  | { id: string; label: string; type: 'choice'; values: [string, number][] };

export interface RawProduct {
  id: string;
  v: string;
  cat: string;
  shape: string;
  name: string;
  unit: string;
  cost: number;
  rrp: number;
  moq: number;
  lead: string;
  note?: string;
  notePh?: string;
  opts?: RawOption[];
}

export interface RawKit {
  id: string;
  cat: string;
  name: string;
  price: number;
  items: [string, number][];
  extras: string[];
  tip: string;
}

export interface RawVendor {
  id: string;
  name: string;
  cat: string;
  color: string;
  loc: string;
  area?: string;
  since: number;
  lead: string;
  ships: string;
  rating: number;
  orders: number;
  reply: string;
  custom?: boolean;
  featured?: boolean;
  about: string;
  about2?: string;
  tags: string[];
  customNote?: string;
}

export interface RawCatalogue {
  categories: { id: string; name: string; shape: string }[];
  vendors: RawVendor[];
  colours: Record<string, string>;
  products: RawProduct[];
  kits: RawKit[];
  states: string[];
  delivery: { id: string; name: string; fee: number; eta: string }[];
  goals: number[];
  bundle: { minNaira: number; pct: number };
}

export const prototype = raw as unknown as RawCatalogue;

/** Prototype `choice` becomes `select` (plan section 3); naira become kobo. */
export function convertOption(o: RawOption): ProductOption {
  if (o.type === 'check') return { type: 'check', id: o.id, label: o.label, addKobo: fromNaira(o.add) };
  return {
    type: 'select',
    id: o.id,
    label: o.label,
    values: o.values.map(([value, add]) => ({ value, addKobo: fromNaira(add) })),
  };
}

export function convertProduct(p: RawProduct): PricingProduct {
  return {
    id: p.id,
    vendorId: p.v,
    categoryId: p.cat,
    costKobo: fromNaira(p.cost),
    rrpKobo: fromNaira(p.rrp),
    moq: p.moq,
    ...(p.opts ? { options: p.opts.map(convertOption) } : {}),
    stockQty: null,
  };
}

/** `sortOrder` follows the prototype's array order, so Skincare sorts before Health Corner. */
export function convertKit(k: RawKit, index: number): PricingKit {
  return {
    id: k.id,
    priceKobo: fromNaira(k.price),
    items: k.items.map(([productId, qty]) => ({ productId, qty })),
    sortOrder: (index + 1) * 10,
  };
}

export const prototypeProducts: PricingProduct[] = prototype.products.map(convertProduct);
export const prototypeKits: PricingKit[] = prototype.kits.map(convertKit);
export const prototypeBundleRules: BundleRule[] = [
  { scope: 'global', minKobo: fromNaira(prototype.bundle.minNaira), pct: prototype.bundle.pct },
];
