import { describe, expect, it } from 'vitest';
import { optionAddOn } from './options.js';
import { PricingError } from './errors.js';
import { N, product, products } from '../test/helpers.js';

const tote = products.get('lux-tote')!;

describe('optionAddOn (BR-02)', () => {
  it('adds select and check add-ons', () => {
    const r = optionAddOn(tote, { colour: 'Olive', hw: 'Gold', mono: true, gift: true });
    expect(r.addKobo).toBe(N(1_000 + 1_500 + 1_200));
    expect(r.text).toBe('Olive · Gold · Gold-foil monogram · Gift box');
    expect(r.isCustom).toBe(true);
  });

  it('defaults an unselected select option to its first value', () => {
    expect(optionAddOn(tote).addKobo).toBe(0);
    expect(optionAddOn(tote, {}).text).toBe('');
  });

  it('is custom with a note even without ticked checks', () => {
    expect(optionAddOn(tote, { colour: 'Black' }).isCustom).toBe(false);
    expect(optionAddOn(tote, { colour: 'Black' }, 'Monogram A.O.').isCustom).toBe(true);
    expect(optionAddOn(tote, { mono: false }, '   ').isCustom).toBe(false);
  });

  it('rejects unknown options and values so a tampered request cannot invent a price', () => {
    expect(() => optionAddOn(tote, { colour: 'Gold' })).toThrow(PricingError);
    expect(() => optionAddOn(tote, { discount: true })).toThrow(/no option/);
    expect(() => optionAddOn(tote, { mono: 'yes' })).toThrow(/true or false/);
    expect(() => optionAddOn(products.get('shea')!, { colour: 'Black' })).toThrow(PricingError);
  });

  it('treats option ids that shadow Object.prototype members as ordinary ids', () => {
    const p = product({
      id: 'proto',
      options: [
        { type: 'check', id: 'constructor', label: 'Gift wrap', addKobo: N(200) },
        {
          type: 'select',
          id: 'toString',
          label: 'Size',
          values: [
            { value: 'S', addKobo: N(0) },
            { value: 'L', addKobo: N(500) },
          ],
        },
      ],
    });
    expect(optionAddOn(p).addKobo).toBe(0);
    expect(optionAddOn(p, { constructor: true, toString: 'L' }).addKobo).toBe(N(700));
  });
});
