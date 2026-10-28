import { NextRequest, NextResponse } from 'next/server';
import { verifyShrxPassword, isShrxPasswordConfigured } from '@/lib/shrx/password';
import {
  SHRX_COOKIE, SHRX_COOKIE_OPTIONS, clientIp, lockoutSecondsLeft, recordAttempt, shrxAudit, signShrxSession,
} from '@/lib/shrx/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);

  if (!isShrxPasswordConfigured()) {
    return NextResponse.json(
      { error: 'SHRX password is not set up yet (placeholder hash in lib/shrx/password.ts).' },
      { status: 503 }
    );
  }

  const wait = await lockoutSecondsLeft(ip);
  if (wait > 0) {
    await shrxAudit('login.blocked', null, { reason: 'locked out', seconds_left: wait }, ip);
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  const ok = password.length > 0 && password.length <= 256 && verifyShrxPassword(password);

  await recordAttempt(ip, ok);
  if (!ok) {
    // Never log the attempted password.
    await shrxAudit('login.failed', null, null, ip);
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }

  await shrxAudit('login.success', null, null, ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SHRX_COOKIE, await signShrxSession(), SHRX_COOKIE_OPTIONS);
  return res;
}
