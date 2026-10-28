import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { PIN_COOKIE, verifyPinUnlock } from '@/lib/section-pin';

/**
 * Server-side check for the Suppliers/Purchases PIN. Middleware already
 * guards the page and API routes; server actions call this too, because a
 * server action can be invoked from any URL.
 */
export async function isSectionPinUnlocked(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return verifyPinUnlock(cookies().get(PIN_COOKIE)?.value, session.userId);
}

export const PIN_LOCKED_ERROR = 'This section is locked. Re-enter the PIN and try again.';

export async function assertSectionPinUnlocked(): Promise<void> {
  if (!(await isSectionPinUnlocked())) throw new Error(PIN_LOCKED_ERROR);
}
