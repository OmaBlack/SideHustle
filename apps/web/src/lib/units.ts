const ES = /(s|x|z|ch|sh)$/i;

/**
 * English plural of a vendor's unit for a quantity, so buyers read
 * "Min. 6 belts" rather than "Min. 6 belt". Multi-word units ("pair of
 * slippers") are left as they are. Locale-specific rules move into ICU
 * messages when a second language is added (NFR-USE-03).
 */
export function unitFor(unit: string, n: number): string {
  const u = unit.trim();
  if (n === 1 || !u || /\s/.test(u)) return u;
  if (/[^aeiou]y$/i.test(u)) return `${u.slice(0, -1)}ies`;
  if (ES.test(u)) return `${u}es`;
  return `${u}s`;
}
