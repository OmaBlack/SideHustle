import { PricingError } from './errors.js';
import { kobo, type Kobo } from './money.js';
import type { OptionSelection, PricingProduct } from './types.js';

export interface OptionAddOn {
  addKobo: Kobo;
  /** Human summary, e.g. "Olive · Gold · Gold-foil monogram". */
  text: string;
  /** A line is custom if it has a note or any ticked check option (BR-02, FR-PROD). */
  isCustom: boolean;
}

/**
 * BR-02: per-unit add-on for the chosen options. Promos never apply to add-ons.
 * An unselected select option takes its first value (the prototype's default).
 * Throws on an unknown option id or value, so a tampered request cannot
 * invent a cheaper choice.
 */
export function optionAddOn(
  product: PricingProduct,
  selection?: OptionSelection,
  note?: string,
): OptionAddOn {
  const opts = product.options ?? [];
  const sel = selection ?? {};
  for (const key of Object.keys(sel)) {
    if (!opts.some((o) => o.id === key)) {
      throw new PricingError('UNKNOWN_OPTION', `Product ${product.id} has no option "${key}"`);
    }
  }
  let add = 0;
  let ticked = false;
  const parts: string[] = [];
  for (const o of opts) {
    const v = sel[o.id];
    if (o.type === 'check') {
      if (v !== undefined && typeof v !== 'boolean') {
        throw new PricingError('INVALID_OPTION_VALUE', `Option "${o.id}" expects true or false`);
      }
      if (v) {
        add += o.addKobo;
        ticked = true;
        parts.push(o.label);
      }
    } else {
      const chosen = v === undefined ? o.values[0] : o.values.find((x) => x.value === v);
      if (!chosen) {
        throw new PricingError('INVALID_OPTION_VALUE', `Option "${o.id}" has no value "${String(v)}"`);
      }
      add += chosen.addKobo;
      if (v !== undefined) parts.push(chosen.value);
    }
  }
  return { addKobo: kobo(add), text: parts.join(' · '), isCustom: ticked || !!note?.trim() };
}
