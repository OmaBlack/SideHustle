import { describe, expect, it } from 'vitest';
import { DealHeadline, Money, NigerianPhone, toE164 } from './common.js';

describe('shared schemas', () => {
  it('money is whole, non-negative kobo in NGN', () => {
    expect(Money.safeParse({ amount_kobo: 176_000, currency: 'NGN' }).success).toBe(true);
    expect(Money.safeParse({ amount_kobo: 1.5, currency: 'NGN' }).success).toBe(false);
    expect(Money.safeParse({ amount_kobo: -1, currency: 'NGN' }).success).toBe(false);
    expect(Money.safeParse({ amount_kobo: 1, currency: 'USD' }).success).toBe(false);
  });

  it('normalises Nigerian phone numbers to E.164', () => {
    expect(toE164('0801 234 5678')).toBe('+2348012345678');
    expect(toE164('2349012345678')).toBe('+2349012345678');
    expect(toE164('+234 (701) 234-5678')).toBe('+2347012345678');
    expect(toE164('801 234 5678')).toBe('+2348012345678');
    expect(toE164('0601 234 5678')).toBeNull();
    expect(NigerianPhone.safeParse('+2348012345678').success).toBe(true);
    expect(NigerianPhone.safeParse('08012345678').success).toBe(false);
  });

  it('blocks deal headlines over 60 characters (AC-10)', () => {
    expect(DealHeadline.safeParse('x'.repeat(60)).success).toBe(true);
    expect(DealHeadline.safeParse('x'.repeat(61)).success).toBe(false);
    expect(DealHeadline.safeParse('   ').success).toBe(false);
  });
});
