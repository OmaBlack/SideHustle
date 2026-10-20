const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Whole-naira display for a kobo amount, e.g. 176000 → "₦1,760" (plan section 9). */
export function formatNaira(kobo: number): string {
  return naira.format(Math.round(kobo / 100));
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
