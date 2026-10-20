import { createHash } from 'node:crypto';

/**
 * Deterministic UUID (RFC 4122 v5 layout) for seed rows, so reseeding keeps the
 * same ids and links stay stable between environments.
 */
export function seedId(kind: string, slug: string): string {
  const h = createHash('sha1').update(`sidehustle:${kind}:${slug}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
