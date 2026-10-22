/**
 * The client IP to pass to the API. Only a value the hosting platform sets is trusted: either a named header the
 * platform overwrites (e.g. cf-connecting-ip, x-real-ip), or `xff-last`, the last X-Forwarded-For entry, which is
 * the one appended by the platform's own load balancer. The browser-supplied chain is never forwarded.
 */
export function clientIp(headers: Pick<Headers, 'get'>, setting?: string | null): string | null {
  const mode = setting?.trim().toLowerCase() || 'xff-last';
  if (mode === 'xff-last') {
    const parts = (headers.get('x-forwarded-for') ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1]! : null;
  }
  const value = headers.get(mode)?.trim();
  return value ? value : null;
}
