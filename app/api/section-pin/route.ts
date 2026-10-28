import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  PIN_COOKIE, PIN_COOKIE_OPTIONS, isPinGatedPage, pinMatches, signPinUnlock,
} from '@/lib/section-pin';

// Unlocks the Suppliers + Purchases sections for the logged-in user.
//
// In-memory brute-force brake for the 4-digit PIN: 5 wrong tries per user
// → 15-minute lockout. Resets on app restart, which is acceptable for a
// privacy gate (the app login is the real access control).
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map<string, { count: number; lockedUntil: number }>();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const now = Date.now();
  const rec = fails.get(session.userId);
  if (rec && rec.lockedUntil > now) {
    const mins = Math.ceil((rec.lockedUntil - now) / 60000);
    return NextResponse.json(
      { error: `Too many wrong attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const pin = typeof body.pin === 'string' ? body.pin : '';
  if (!pinMatches(pin)) {
    const prior = rec && rec.lockedUntil === 0 ? rec.count : 0;
    const count = prior + 1;
    fails.set(session.userId, { count, lockedUntil: count >= MAX_FAILS ? now + LOCK_MS : 0 });
    return NextResponse.json(
      { error: count >= MAX_FAILS ? 'Too many wrong attempts. Locked for 15 minutes.' : 'Incorrect PIN.' },
      { status: 403 }
    );
  }

  fails.delete(session.userId);
  // Only ever send the user back into a gated section page.
  const next = typeof body.next === 'string' ? body.next : '';
  const safeNext = next.startsWith('/') && !next.startsWith('//') && isPinGatedPage(next.split('?')[0]) ? next : '/billing';

  const res = NextResponse.json({ ok: true, next: safeNext });
  res.cookies.set(PIN_COOKIE, await signPinUnlock(session.userId), PIN_COOKIE_OPTIONS);
  return res;
}
