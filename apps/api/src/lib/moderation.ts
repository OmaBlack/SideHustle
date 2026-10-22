/**
 * Plan section 10 [Default]: deal headlines and request text with links,
 * email addresses or phone numbers are held for an admin; everything else
 * publishes straight away. Returns the reasons it was held, if any.
 */
export function moderationFlags(...texts: (string | null | undefined)[]): string[] {
  const t = texts.filter(Boolean).join(' \n ');
  const flags: string[] = [];
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|co)\b)/i.test(t)) flags.push('link');
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) flags.push('email');
  if (/(\+?234|\b0)[\s-]?[789][01](?:[\s-]?\d){8}\b/.test(t)) flags.push('phone');
  return flags;
}
