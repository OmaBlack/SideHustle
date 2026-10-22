/**
 * Plan section 10 [Default]: deal headlines and request text with links,
 * email addresses or phone numbers are held for an admin; everything else
 * publishes straight away. Returns the reasons it was held, if any.
 */
export function moderationFlags(...texts: (string | null | undefined)[]): string[] {
  const t = texts.filter(Boolean).join(' \n ');
  const flags: string[] = [];
  // Only the first 1000 characters are pattern-matched, and emails are checked per
  // whitespace token, so no regex ever backtracks over unbounded user input.
  const head = t.slice(0, 1000);
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|co)\b)/i.test(head)) flags.push('link');
  if (t.split(/\s+/).some((w) => w.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w)))
    flags.push('email');
  if (/(\+?234|\b0)[\s-]?[789][01](?:[\s-]?\d){8}\b/.test(head)) flags.push('phone');
  return flags;
}
