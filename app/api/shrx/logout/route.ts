import { NextRequest, NextResponse } from 'next/server';
import { SHRX_COOKIE, clientIp, hasShrxSession, shrxAudit } from '@/lib/shrx/session';

export async function POST(req: NextRequest) {
  if (await hasShrxSession()) await shrxAudit('logout', null, null, clientIp(req.headers));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SHRX_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
