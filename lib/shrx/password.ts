import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

// ─── SHRX console password ────────────────────────────────────────────────────
// Only a salted scrypt hash lives here — never the password. To set it:
//
//   npx tsx scripts/hash-shrx-password.ts
//
// (it prompts without echoing), then paste the printed line over the
// placeholder below. Not read from env, DB or any settings UI, by design.
// While the placeholder is in place every login is refused.

export const SHRX_PASSWORD_HASH = 'PLACEHOLDER_REPLACE_WITH_OUTPUT_OF_scripts/hash-shrx-password.ts';

// Format: scrypt$N$r$p$<salt base64>$<key base64>
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export function hashShrxPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export function isShrxPasswordConfigured(stored: string = SHRX_PASSWORD_HASH): boolean {
  return stored.startsWith('scrypt$') && stored.split('$').length === 6;
}

/** Constant-time check of `password` against a stored scrypt hash. */
export function verifyShrxPassword(password: string, stored: string = SHRX_PASSWORD_HASH): boolean {
  if (!isShrxPasswordConfigured(stored)) return false;
  const [, n, r, p, saltB64, keyB64] = stored.split('$');
  const expected = Buffer.from(keyB64, 'base64');
  let actual: Buffer;
  try {
    actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
