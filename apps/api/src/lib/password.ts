import { hash, verify } from '@node-rs/argon2';

// Argon2id (the library default) with OWASP's 19 MiB / 2 iterations baseline (FR-ACC-03).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, OPTIONS);

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** A real hash to compare against when the email is unknown, so timing does not reveal accounts. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword('not-a-real-password'));
