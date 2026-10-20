import { describe, expect, it } from 'vitest';
import { effectivePrice, isLive, liveDeals, promoAppliesTo } from './deals.js';
import { lagosDate } from './time.js';
import { NOW, product, promo } from '../test/helpers.js';

describe('isLive (BR-06)', () => {
  it('needs a headline', () => {
    expect(isLive(promo({ headline: '  ' }), NOW)).toBe(false);
  });
  it('needs a discount above zero for promos, not for launches', () => {
    expect(isLive(promo({ discountPct: 0 }), NOW)).toBe(false);
    expect(isLive(promo({ kind: 'launch', discountPct: 0 }), NOW)).toBe(true);
  });
  it('allows an empty end date and stays live through the end day in Lagos', () => {
    expect(isLive(promo({ endsOn: null }), NOW)).toBe(true);
    expect(isLive(promo({ endsOn: '2026-10-20' }), NOW)).toBe(true);
  });
  it('uses the Lagos date, not UTC: a promo ending 20 Oct is over at 00:30 Lagos on 21 Oct', () => {
    const justAfterMidnightLagos = new Date('2026-10-20T23:30:00Z');
    expect(lagosDate(justAfterMidnightLagos)).toBe('2026-10-21');
    expect(isLive(promo({ endsOn: '2026-10-20' }), justAfterMidnightLagos)).toBe(false);
  });
  it('starts exactly at starts_at', () => {
    expect(isLive(promo({ startsAt: NOW }), NOW)).toBe(true);
  });
});

describe('promoAppliesTo', () => {
  const p = product({ id: 'p1', vendorId: 'v1', categoryId: 'c1' });
  it('ignores launches and other vendors', () => {
    expect(promoAppliesTo(promo({ kind: 'launch', discountPct: 0 }), p)).toBe(false);
    expect(promoAppliesTo(promo({ vendorId: 'v2' }), p)).toBe(false);
  });
  it('matches by product or by category', () => {
    expect(promoAppliesTo(promo({ productId: 'p2' }), p)).toBe(false);
    expect(promoAppliesTo(promo({ scope: 'category', productId: null, categoryId: 'c1' }), p)).toBe(true);
    expect(promoAppliesTo(promo({ scope: 'category', productId: null, categoryId: 'c2' }), p)).toBe(false);
  });
});

describe('effectivePrice (BR-01)', () => {
  const p = product({ id: 'p1' });
  it('takes the highest discount; promos never stack', () => {
    const r = effectivePrice(
      p,
      [promo({ discountPct: 10 }), promo({ discountPct: 25 }), promo({ discountPct: 5 })],
      NOW,
    );
    expect(r.discountPct).toBe(25);
    expect(r.unitKobo).toBe(75_000);
  });
  it('breaks equal discounts by newest, then lower id', () => {
    const older = promo({ id: 'b', discountPct: 10, createdAt: new Date('2026-10-01') });
    const newer = promo({ id: 'c', discountPct: 10, createdAt: new Date('2026-10-05') });
    const twin = promo({ id: 'a', discountPct: 10, createdAt: new Date('2026-10-05') });
    expect(effectivePrice(p, [older, newer], NOW).dealId).toBe('c');
    expect(effectivePrice(p, [newer, twin], NOW).dealId).toBe('a');
    expect(effectivePrice(p, [twin, newer], NOW).dealId).toBe('a');
    expect(effectivePrice(p, [newer, older], NOW).dealId).toBe('c');
  });
  it('returns the wholesale price when nothing applies', () => {
    expect(effectivePrice(p, [], NOW)).toEqual({ unitKobo: 100_000, originalKobo: 100_000, discountPct: 0 });
  });
});

describe('liveDeals', () => {
  it('filters to live deals, newest first', () => {
    const a = promo({ id: 'a', createdAt: new Date('2026-10-01') });
    const b = promo({ id: 'b', createdAt: new Date('2026-10-03') });
    const dead = promo({ id: 'x', endsOn: '2026-01-01' });
    expect(liveDeals([a, dead, b], NOW).map((d) => d.id)).toEqual(['b', 'a']);
  });
});
