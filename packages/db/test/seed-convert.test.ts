import { describe, expect, it } from 'vitest';
import { buildSeed, seedId } from '../src/seed/index.js';

describe('seed converter (pure)', () => {
  const seed = buildSeed();

  it('converts the whole prototype catalogue', () => {
    expect(seed.categories).toHaveLength(6);
    expect(seed.vendors).toHaveLength(17);
    expect(seed.products).toHaveLength(28);
    expect(seed.kits).toHaveLength(7);
    expect(seed.deliveryMethods.map((d) => [d.code, d.feeKobo])).toEqual([
      ['pickup', 0],
      ['lagos', 350_000],
      ['inter', 850_000],
    ]);
  });

  it('stores money in kobo and maps choice options to select', () => {
    const tote = seed.products.find((p) => p.slug === 'lux-tote')!;
    expect(tote.costKobo).toBe(1_850_000);
    expect(tote.options[0]).toEqual({
      type: 'select',
      id: 'colour',
      label: 'Colour',
      values: [
        { value: 'Cognac', add_kobo: 0 },
        { value: 'Black', add_kobo: 0 },
        { value: 'Oxblood', add_kobo: 0 },
        { value: 'Olive', add_kobo: 100_000 },
      ],
    });
    expect(tote.options[2]).toEqual({
      type: 'check',
      id: 'mono',
      label: 'Gold-foil monogram',
      add_kobo: 150_000,
    });
  });

  it('seeds Skincare before Health Corner so the freedom-number tie is deterministic', () => {
    const order = seed.kits.map((k) => k.slug);
    expect(order.indexOf('skin')).toBeLessThan(order.indexOf('pharm'));
  });

  it('uses stable, valid UUIDs', () => {
    expect(seedId('product', 'shea')).toBe(seedId('product', 'shea'));
    expect(seedId('product', 'shea')).not.toBe(seedId('vendor', 'shea'));
    expect(seedId('product', 'shea')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
