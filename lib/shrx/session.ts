import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// ─── SHRX session ─────────────────────────────────────────────────────────────
// Separate from the app login: /shrx and /api/shrx/* are carved out of the
// auth middleware and protected only by this signed, httpOnly, sameSite=strict
// cookie, valid for 30 minutes from login (not sliding).

export const SHRX_COOKIE = 'shrx_session';
const SHRX_TTL_SECONDS = 30 * 60;

// Lockout: 5 failed attempts from one IP in 15 minutes locks that IP for the
// rest of the window. A global ceiling also applies, because the client IP
// comes from proxy headers that can be forged by anyone who reaches nginx
// directly instead of through Cloudflare.
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 25;
const WINDOW_MINUTES = 15;

const getSecret = () =>
  new TextEncoder().encode(
    (process.env.SESSION_SECRET ?? 'dev-secret-change-in-production-min-32-chars!!') + ':shrx-console'
  );

export async function signShrxSession(): Promise<string> {
  return new SignJWT({ scope: 'shrx' })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${SHRX_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyShrxToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.scope === 'shrx';
  } catch {
    return false;
  }
}

export const SHRX_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SHRX_TTL_SECONDS,
};

/** Client IP: Cloudflare header, then nginx's X-Real-IP, then X-Forwarded-For. */
export function clientIp(h: Headers = headers()): string {
  return (
    h.get('cf-connecting-ip') ??
    h.get('x-real-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/** Seconds until this IP may try again, or 0 if not locked. */
export async function lockoutSecondsLeft(ip: string): Promise<number> {
  const res = await query<{ ip_fails: string; ip_oldest: string | null; all_fails: string; all_oldest: string | null }>(
    `WITH recent AS (
       SELECT ip, success, created_at FROM shrx_login_attempts
       WHERE created_at > NOW() - make_interval(mins => $2)
     ),
     ip_since AS (
       SELECT created_at FROM recent
       WHERE ip = $1 AND NOT success
         AND created_at > COALESCE((SELECT MAX(created_at) FROM recent WHERE ip = $1 AND success), '-infinity')
     )
     SELECT (SELECT COUNT(*) FROM ip_since)::text AS ip_fails,
            (SELECT MIN(created_at) FROM ip_since)::text AS ip_oldest,
            (SELECT COUNT(*) FROM recent WHERE NOT success)::text AS all_fails,
            (SELECT MIN(created_at) FROM recent WHERE NOT success)::text AS all_oldest`,
    [ip, WINDOW_MINUTES]
  );
  const r = res.rows[0];
  const left = (oldest: string | null) =>
    oldest ? Math.max(1, Math.ceil((new Date(oldest).getTime() + WINDOW_MINUTES * 60_000 - Date.now()) / 1000)) : 0;
  if (Number(r.ip_fails) >= MAX_FAILS_PER_IP) return left(r.ip_oldest);
  if (Number(r.all_fails) >= MAX_FAILS_GLOBAL) return left(r.all_oldest);
  return 0;
}

export async function recordAttempt(ip: string, success: boolean): Promise<void> {
  await query('INSERT INTO shrx_login_attempts (ip, success) VALUES ($1,$2)', [ip, success]);
}

/** Append to shrx_audit_log. Every SHRX action calls this. */
export async function shrxAudit(action: string, target: string | null, details: Record<string, unknown> | null, ip: string) {
  await query(
    'INSERT INTO shrx_audit_log (action, target, details, ip) VALUES ($1,$2,$3,$4)',
    [action, target, details ? JSON.stringify(details) : null, ip]
  ).catch((e) => console.error('[shrx] audit write failed', e));
}

/** For server components: is the current request an authenticated SHRX session? */
export async function hasShrxSession(): Promise<boolean> {
  return verifyShrxToken(cookies().get(SHRX_COOKIE)?.value);
}

/**
 * Guard for /api/shrx/* handlers (other than login). Returns the caller's IP,
 * or a 401/403 response. State-changing requests must also come from this
 * origin (sameSite=strict already blocks cross-site cookies; this is a second
 * layer).
 */
export async function requireShrx(req: Request): Promise<{ ip: string } | NextResponse> {
  if (!(await hasShrxSession())) {
    return NextResponse.json({ error: 'SHRX session expired. Log in again.' }, { status: 401 });
  }
  if (req.method !== 'GET') {
    // Compare host NAMES only: behind nginx the Host header drops a
    // non-default port (`localhost` vs Origin `localhost:8088`).
    const origin = req.headers.get('origin');
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    const hostname = (h: string) => h.replace(/:\d+$/, '').toLowerCase();
    if (origin && host && hostname(new URL(origin).host) !== hostname(host)) {
      return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
    }
  }
  return { ip: clientIp(req.headers) };
}

/**
 * The user recorded as created_by when a SHRX action has to write rows that
 * require one (e.g. the payment journal entries a silent due-clear posts):
 * the earliest-created active admin. The SHRX audit log records that the
 * action actually came from the SHRX console.
 */
export async function shrxActingUserId(): Promise<string> {
  const res = await query<{ id: string }>(
    `SELECT id FROM users WHERE role='admin' AND is_active=TRUE ORDER BY created_at LIMIT 1`
  );
  if (!res.rows[0]) throw new Error('No active admin user exists to record this action against.');
  return res.rows[0].id;
}
