import { createHash, randomBytes, randomInt } from 'node:crypto';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const sixDigitCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** BR-11: `SH-` + 8 Crockford base32 characters from a CSPRNG (40 bits). */
export function orderRef(): string {
  const bytes = randomBytes(5);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out = CROCKFORD[Number(n & 31n)]! + out;
    n >>= 5n;
  }
  return `SH-${out}`;
}
