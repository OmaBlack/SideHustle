/** Shapes returned by the API (apps/api), kept to what pages read. Money is integer kobo. */
export interface Category {
  id: string;
  slug: string;
  name: string;
  productCount: number;
}
export interface VendorSummary {
  id: string;
  slug: string;
  name: string;
  location: string;
  color: string | null;
  verified: boolean;
  rating: number | null;
  acceptsCustom: boolean;
  replyTimeText: string | null;
}
export interface ProductView {
  id: string;
  slug: string;
  name: string;
  unit: string;
  category: { id: string; slug: string; name: string };
  vendor: VendorSummary;
  unitKobo: number;
  originalKobo: number;
  discountPct: number;
  rrpKobo: number;
  marginPct: number;
  moq: number;
  leadTimeText: string | null;
  customisable: boolean;
  artKey: string | null;
  inStock: boolean;
}
export type StoredOption =
  | { type: 'check'; id: string; label: string; add_kobo: number }
  | { type: 'select'; id: string; label: string; values: { value: string; add_kobo: number }[] };
export interface ProductDetail extends ProductView {
  note: string | null;
  notePlaceholder: string | null;
  options: StoredOption[];
  vendor: VendorSummary & { leadTimeText: string | null; customNote: string | null; ordersCount: number };
}
export interface KitView {
  id: string;
  slug: string;
  name: string;
  category: { id: string; slug: string; name: string };
  priceKobo: number;
  costKobo: number;
  retailKobo: number;
  profitKobo: number;
  marginPct: number;
  units: number;
  productCount: number;
  available: boolean;
  tip: string | null;
  items: {
    productId: string;
    slug: string;
    name: string;
    unit: string;
    qty: number;
    rrpKobo: number;
    artKey: string | null;
    vendor: { name: string; slug: string };
  }[];
  extras: string[];
}
export interface VendorListItem extends VendorSummary {
  featured: boolean;
  productCount: number;
}
export interface VendorDetail extends VendorSummary {
  about: string | null;
  about2: string | null;
  tags: string[];
  sinceYear: number | null;
  leadTimeText: string | null;
  shipsTo: string | null;
  ordersCount: number;
  originNote: string | null;
  customNote: string | null;
  productCount: number;
}
export interface DealView {
  id: string;
  kind: 'promo' | 'launch';
  scope: 'product' | 'category';
  headline: string;
  detail: string | null;
  discountPct: number;
  endsOn: string | null;
  vendor: { id: string; slug: string; name: string; color: string | null };
  category: { slug: string; name: string };
  product: { id: string; slug: string; name: string } | null;
  moderationStatus?: string;
  state?: string;
}
export type Slide = { type: 'house'; key: string } | { type: 'deal'; key: string; deal: DealView };
export interface Me {
  id: string;
  name: string;
  email: string;
  phone: string;
  businessName: string;
  state: string | null;
  interests: string[];
  role: 'buyer' | 'vendor_staff' | 'admin';
  emailVerified: boolean;
  phoneVerified: boolean;
  vendorId: string | null;
}
export interface CartLineView {
  id: string;
  kind: 'product' | 'kit' | 'bundle';
  qty: number;
  name: string;
  slug?: string;
  unit?: string;
  artKey?: string | null;
  category?: string;
  vendor?: { name: string; slug: string };
  moq?: number;
  optionText?: string;
  isCustom?: boolean;
  note?: string | null;
  customNote?: string | null;
  originalUnitKobo?: number;
  discountPct?: number;
  unitKobo: number;
  lineTotalKobo: number;
  discountKobo: number;
  units?: number;
  itemCount?: number;
  productCount?: number;
  vendorCount?: number;
  profitKobo?: number;
  available: boolean;
  issues: { code: string; text: string; minQty?: number }[];
  changes: { price: { fromKobo: number; toKobo: number } | null; availability: boolean };
}
export interface CartView {
  lines: CartLineView[];
  count: number;
  subtotalKobo: number;
  bundleDiscountKobo: number;
  totalKobo: number;
  canCheckout: boolean;
  hasChanges: boolean;
}
export interface FulfilmentView {
  id: string;
  kind: 'vendor' | 'hub';
  vendor: { id: string; name: string | null; slug: string | null } | null;
  status: 'awaiting_confirmation' | 'confirmed' | 'rejected' | 'dispatched' | 'delivered';
  stepsDone: number;
  trackingRef: string | null;
  rejectReason: string | null;
  items: {
    name: string;
    qty: number;
    unitKobo: number;
    discountKobo: number;
    optionText: string;
    note: string | null;
  }[];
}
export interface OrderView {
  id: string;
  ref: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string;
  deliveryMethod: string;
  recipient: string;
  phone: string;
  address: { line1: string; line2?: string; city: string; state: string } | null;
  subtotalKobo: number;
  discountKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  itemCount: number;
  payment: { status: string; provider: string; channel: string | null } | null;
  lines: {
    id: string;
    kind: string;
    name: string;
    qty: number;
    unitKobo: number;
    discountKobo: number;
    totalKobo: number;
    optionText: string;
    note: string | null;
    children: { name: string; qty: number }[];
  }[];
  fulfilments: FulfilmentView[];
}
export interface BundleQuote {
  costKobo: number;
  discountKobo: number;
  payKobo: number;
  retailKobo: number;
  profitKobo: number;
  marginPct: number;
  units: number;
  vendorCount: number;
  issues: { index: number; code: string; minQty?: number }[];
}
