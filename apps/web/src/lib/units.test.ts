import { describe, expect, it } from 'vitest';
import { unitFor } from './units';

describe('unitFor', () => {
  it('pluralises common English units', () => {
    expect(unitFor('bag', 3)).toBe('bags');
    expect(unitFor('box', 2)).toBe('boxes');
    expect(unitFor('pouch', 5)).toBe('pouches');
    expect(unitFor('battery', 4)).toBe('batteries');
    expect(unitFor('tray', 4)).toBe('trays');
  });
  it('keeps the singular for one and leaves multi-word units alone', () => {
    expect(unitFor('piece', 1)).toBe('piece');
    expect(unitFor('pair of slippers', 12)).toBe('pair of slippers');
  });
});
