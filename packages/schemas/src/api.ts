import { z } from 'zod';
import { DealHeadline, NigerianState } from './common.js';

/**
 * Request bodies shared by the API (validation + OpenAPI) and the web forms.
 * Money is integer kobo in fields ending `Kobo`.
 */

const phoneInput = z.string().trim().min(1, 'Enter your phone number');

export const PRODUCT_INTERESTS = ['beauty', 'fashion', 'health', 'phone', 'food', 'home'] as const;

export const SignupInput = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  businessName: z.string().trim().max(120).optional().default(''),
  phone: phoneInput,
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  state: NigerianState,
  interests: z.array(z.enum(PRODUCT_INTERESTS)).max(6).default([]),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  /** NDPA: processing consent is required; marketing is optional (NFR-PRV-01). */
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Please accept the terms and privacy notice' }),
  }),
  marketing: z.boolean().default(false),
});
export type SignupInput = z.infer<typeof SignupInput>;

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const ProfileInput = z.object({
  name: z.string().trim().min(2).max(120),
  businessName: z.string().trim().max(120),
  state: NigerianState,
  interests: z.array(z.enum(PRODUCT_INTERESTS)).max(6),
});

export const OtpVerifyInput = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });
export const TokenInput = z.object({ token: z.string().min(16).max(200) });
export const PasswordResetRequest = z.object({ email: z.string().trim().toLowerCase().email() });
export const PasswordResetConfirm = z.object({
  token: z.string().min(16).max(200),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

export const OptionSelectionInput = z.record(z.union([z.boolean(), z.string().max(100)]));

export const BundleItemInput = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1).max(100_000),
  selection: OptionSelectionInput.optional(),
  note: z.string().trim().max(500).optional(),
});
export type BundleItemInput = z.infer<typeof BundleItemInput>;

export const CartLineInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('product'),
    productId: z.string().uuid(),
    qty: z.number().int().min(1).max(100_000),
    selection: OptionSelectionInput.optional(),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({ kind: z.literal('kit'), kitId: z.string().uuid() }),
  z.object({
    kind: z.literal('bundle'),
    name: z.string().trim().max(80).optional(),
    items: z.array(BundleItemInput).min(1).max(100),
  }),
]);
export type CartLineInput = z.infer<typeof CartLineInput>;

export const CartMergeInput = z.object({ lines: z.array(CartLineInput).max(100) });
export const CartQtyInput = z.object({ qty: z.number().int().min(1).max(100_000) });

export const SavedBundleInput = z.object({
  name: z.string().trim().min(1, 'Give your kit a name').max(80),
  items: z.array(BundleItemInput).min(1).max(100),
});

export const BundleQuoteInput = z.object({ items: z.array(BundleItemInput).max(100) });
export const ProductQuoteInput = z.object({
  qty: z.number().int().min(1).max(100_000),
  selection: OptionSelectionInput.optional(),
  note: z.string().trim().max(500).optional(),
});

export const AddressInput = z.object({
  line1: z.string().trim().min(3, 'Enter a street address').max(200),
  line2: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().min(2, 'Enter a town or city').max(80),
  state: NigerianState,
});

export const CheckoutInput = z.object({
  deliveryMethod: z.string().min(1),
  recipient: z.string().trim().min(2, 'Enter the recipient name').max(120),
  phone: phoneInput,
  /** Not needed for pickup (FR-CHK-02). */
  address: AddressInput.optional(),
});
export type CheckoutInput = z.infer<typeof CheckoutInput>;

export const CreateOrderInput = z.object({ quoteId: z.string().uuid() });

export const REQUEST_PROJECT_TYPES = [
  'personalised',
  'white_label',
  'corporate',
  'new_design',
  'other',
] as const;
export const CustomRequestInput = z.object({
  vendorId: z.string().uuid(),
  projectType: z.enum(REQUEST_PROJECT_TYPES),
  brief: z.string().trim().min(10, 'Tell the vendor a little more (at least 10 characters)').max(2000),
  quantityEstimate: z.number().int().min(1).max(1_000_000).optional(),
});

export const VendorApplicationInput = z.object({
  name: z.string().trim().min(2).max(120),
  categoryId: z.string().uuid(),
  location: z.string().trim().min(2).max(120),
  about: z.string().trim().max(2000).optional().default(''),
  acceptsCustom: z.boolean().default(false),
  leadTimeText: z.string().trim().max(60).optional().default(''),
  shipsTo: z.string().trim().max(120).optional().default(''),
});

const StoredOptionInput = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('check'),
    id: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(80),
    add_kobo: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('select'),
    id: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(80),
    values: z
      .array(z.object({ value: z.string().trim().min(1).max(60), add_kobo: z.number().int().min(0) }))
      .min(1)
      .max(30),
  }),
]);

export const ProductInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    categoryId: z.string().uuid(),
    unit: z.string().trim().min(1).max(30),
    costKobo: z.number().int().min(100, 'Price must be at least ₦1'),
    rrpKobo: z.number().int().min(100, 'RRP must be at least ₦1'),
    moq: z.number().int().min(1).max(100_000),
    leadTimeText: z.string().trim().max(60).optional().default(''),
    note: z.string().trim().max(500).optional().default(''),
    stockQty: z.number().int().min(0).nullable().default(null),
    options: z.array(StoredOptionInput).max(10).default([]),
    active: z.boolean().default(true),
  })
  .refine((p) => p.rrpKobo >= p.costKobo, {
    message: 'RRP should not be below your wholesale price',
    path: ['rrpKobo'],
  });
export type ProductInput = z.infer<typeof ProductInput>;

export const DealInput = z
  .object({
    kind: z.enum(['promo', 'launch']),
    scope: z.enum(['product', 'category']).default('category'),
    productId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    discountPct: z.number().int().min(0).max(90).default(0),
    headline: DealHeadline,
    detail: z.string().trim().max(300).optional().default(''),
    /** YYYY-MM-DD, last live day in Lagos. Required for promos [Default]. */
    endsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .superRefine((d, ctx) => {
    if (d.kind === 'promo') {
      if (d.discountPct < 1)
        ctx.addIssue({ code: 'custom', path: ['discountPct'], message: 'Enter a discount of at least 1%' });
      if (!d.endsOn) ctx.addIssue({ code: 'custom', path: ['endsOn'], message: 'Promos need an end date' });
      if (d.scope === 'product' && !d.productId)
        ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Choose a product' });
    }
  });
export type DealInput = z.infer<typeof DealInput>;

export const RejectInput = z.object({ reason: z.string().trim().min(3).max(300) });
export const DispatchInput = z.object({ trackingRef: z.string().trim().min(2).max(80) });
export const RequestReplyInput = z.object({ reply: z.string().trim().min(2).max(2000) });
export const RequestQuoteInput = z.object({
  amountKobo: z.number().int().min(100),
  reply: z.string().trim().max(2000).optional().default(''),
  validDays: z.number().int().min(1).max(60).default(7),
});
export const LicenceInput = z.object({
  licenceType: z.string().trim().min(2).max(40),
  documentKey: z.string().trim().min(2).max(300),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const RefundInput = z.object({
  amountKobo: z.number().int().min(1),
  fulfilmentId: z.string().uuid().optional(),
  reason: z.string().trim().min(3).max(300),
});
export const RuleInput = z.object({
  scope: z.enum(['global', 'category', 'vendor']),
  scopeId: z.string().uuid().nullable().default(null),
  minKobo: z.number().int().min(0),
  pct: z.number().int().min(0).max(90),
});
export const CommissionRuleInput = z.object({
  scope: z.enum(['global', 'category', 'vendor']),
  scopeId: z.string().uuid().nullable().default(null),
  rateBps: z.number().int().min(0).max(10_000),
});
export const DeliveryMethodInput = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{2,30}$/),
  name: z.string().trim().min(2).max(80),
  feeKobo: z.number().int().min(0),
  etaText: z.string().trim().max(60).default(''),
  eligibleStates: z.array(NigerianState).default([]),
  partner: z.string().trim().max(80).nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export const KitInput = z.object({
  name: z.string().trim().min(2).max(120),
  categoryId: z.string().uuid(),
  priceKobo: z.number().int().min(100),
  tip: z.string().trim().max(500).default(''),
  active: z.boolean().default(true),
  platformFunded: z.boolean().default(false),
  sortOrder: z.number().int().default(100),
  items: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().int().min(1) }))
    .min(1)
    .max(30),
  extras: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
});
export const HubReceiveInput = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1),
  reason: z.string().trim().max(200).default(''),
});
export const HubCountInput = z.object({
  productId: z.string().uuid(),
  counted: z.number().int().min(0),
  reason: z.string().trim().min(2).max(200),
});
export const HubThresholdInput = z.object({
  productId: z.string().uuid(),
  lowStockThreshold: z.number().int().min(0),
});
export const ConfigInput = z.object({ value: z.unknown() });
export const RetentionInput = z.object({
  dataType: z.string().trim().min(2).max(40),
  retainDays: z.number().int().min(1),
  action: z.enum(['archive', 'purge']),
});
export const RestrictionInput = z
  .object({
    categoryId: z.string().uuid().nullable().default(null),
    productId: z.string().uuid().nullable().default(null),
    requiredLicence: z.string().trim().min(2).max(40),
  })
  .refine((r) => (r.categoryId === null) !== (r.productId === null), {
    message: 'Choose a category or a product',
  });
export const CategoryInput = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,30}$/),
  name: z.string().trim().min(2).max(60),
  sortOrder: z.number().int().default(100),
});
