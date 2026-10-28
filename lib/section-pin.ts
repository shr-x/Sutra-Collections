import { SignJWT, jwtVerify } from 'jose';

// ─── Section PIN (Suppliers + Purchases) ─────────────────────────────────────
// A workplace-privacy gate in front of the Suppliers and Purchases sections.
// The PIN is hardcoded on purpose (not env, not DB, not in any settings UI) and
// lives ONLY in server code. This file is imported by middleware and server
// actions, never by a client component, so the PIN never reaches the browser.
//
// Unlocking sets a signed, httpOnly cookie bound to the logged-in user. One
// unlock opens both sections (same PIN, same cookie). It expires with the
// normal 3-hour idle window, or on logout (different user → invalid).
//
// Edge-safe: only `jose` + Web APIs, because middleware runs on the edge.

/** Change this to the real PIN before deploying. Shared by Suppliers and Purchases. */
export const SECTION_PIN = '6114';

export const PIN_COOKIE = 'sutra_section_pin';
const PIN_TTL_SECONDS = 3 * 60 * 60;

/** Page routes behind the PIN. Prefix match. */
export const PIN_GATED_PAGE_PREFIXES = ['/suppliers', '/billing/purchases'];

/**
 * API routes behind the PIN.
 * NOT gated (used by the Debit Notes form, which is outside these sections):
 *   /api/suppliers/[id]/purchase-invoices, /api/purchase-invoices/[id]/items
 */
export function isPinGatedApi(pathname: string): boolean {
  return pathname === '/api/suppliers' || pathname.startsWith('/api/purchases/');
}

export function isPinGatedPage(pathname: string): boolean {
  return PIN_GATED_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const getSecret = () =>
  new TextEncoder().encode(
    (process.env.SESSION_SECRET ?? 'dev-secret-change-in-production-min-32-chars!!') + ':section-pin'
  );

/** Constant-time string comparison (both sides padded to the same length). */
export function pinMatches(input: string): boolean {
  const a = new TextEncoder().encode(input.padEnd(16, '\0').slice(0, 16));
  const b = new TextEncoder().encode(SECTION_PIN.padEnd(16, '\0').slice(0, 16));
  let diff = input.length === SECTION_PIN.length ? 0 : 1;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signPinUnlock(userId: string): Promise<string> {
  return new SignJWT({ scope: 'section-pin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${PIN_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyPinUnlock(token: string | undefined, userId: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.scope === 'section-pin' && payload.sub === userId;
  } catch {
    return false;
  }
}

export const PIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: PIN_TTL_SECONDS,
};
