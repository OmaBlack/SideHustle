import { z } from 'zod';

/** Money on the wire: `{ amount_kobo, currency: "NGN" }` (plan section 6). */
export const Money = z
  .object({
    amount_kobo: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    currency: z.literal('NGN'),
  })
  .describe('Money in kobo');
export type Money = z.infer<typeof Money>;

export const money = (amountKobo: number): Money => ({ amount_kobo: amountKobo, currency: 'NGN' });

/** RFC 7807 problem details with a stable `code`. */
export const Problem = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});
export type Problem = z.infer<typeof Problem>;

/** E.164 Nigerian mobile number, e.g. +2348012345678. */
export const NigerianPhone = z.string().regex(/^\+234[789][01]\d{8}$/, 'Enter a Nigerian mobile number');

/** Normalises 08012345678, 8012345678 (after a fixed +234 prefix), 2348012345678 or +234 801 234 5678 to E.164. Returns null if it cannot. */
export function toE164(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');
  const m = /^(?:\+?234|0)?([789][01]\d{8})$/.exec(digits);
  return m ? `+234${m[1]}` : null;
}

export const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;
export const NigerianState = z.enum(NIGERIAN_STATES);

/** Deal headline (BR-07). */
export const DealHeadline = z.string().trim().min(1).max(60);

export const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  checks: z.record(z.enum(['ok', 'fail'])),
});
export type Health = z.infer<typeof Health>;
