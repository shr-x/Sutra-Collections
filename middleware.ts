import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession, signSession, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/session';
import type { Role } from '@/types';
import { PIN_COOKIE, isPinGatedApi, isPinGatedPage, verifyPinUnlock } from '@/lib/section-pin';

const PUBLIC_PATHS = ['/login', '/consent', '/api/webhooks'];

// Paths that require specific roles. Admin always passes.
// First-match wins, so put more specific paths first.
const ROLE_RULES: Array<{ path: string; allow: Role[] }> = [
  { path: '/dashboard',  allow: ['admin'] },
  { path: '/settings',   allow: ['admin'] },
  { path: '/customers',  allow: ['admin', 'accountant'] },
  { path: '/suppliers',  allow: ['admin'] },
  { path: '/inventory',  allow: ['admin'] },
  { path: '/billing',    allow: ['admin', 'staff'] },
  { path: '/accounting', allow: ['admin', 'accountant'] },
  { path: '/reports',    allow: ['admin', 'accountant'] },
  { path: '/designs',    allow: ['admin'] },
  { path: '/tailoring/production', allow: ['admin'] },
  { path: '/tailoring/tailors',    allow: ['admin'] },
];

const ROLE_HOME: Record<Role, string> = {
  admin: '/dashboard',
  staff: '/billing',
  accountant: '/accounting',
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = await verifySession(token);

  if (!session) {
    const res = NextResponse.redirect(new URL('/login', request.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // Time-boxed access check
  if (session.accessExpiresAt !== null && Date.now() > session.accessExpiresAt) {
    const res = NextResponse.redirect(new URL('/login?reason=access_expired', request.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // Role-based path restrictions
  for (const rule of ROLE_RULES) {
    if (pathname.startsWith(rule.path) && !rule.allow.includes(session.role)) {
      return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
    }
  }

  // Suppliers / Purchases PIN gate (server-side). A locked page GET renders
  // the PIN screen in place (rewrite to /unlock; the PIN is posted to
  // /api/section-pin). Locked API calls and any other method on a gated page
  // (e.g. server-action POSTs) get 403. Every action in those sections also
  // re-checks the PIN itself, since actions can be invoked from any URL.
  const gatedPage = isPinGatedPage(pathname);
  if (gatedPage || isPinGatedApi(pathname)) {
    const unlocked = await verifyPinUnlock(request.cookies.get(PIN_COOKIE)?.value, session.userId);
    if (!unlocked) {
      if (!gatedPage || request.method !== 'GET') {
        return NextResponse.json({ error: 'Section locked. Enter the PIN first.' }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = '/unlock';
      url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      const refreshed = await signSession(session);
      const res = NextResponse.rewrite(url);
      res.cookies.set(COOKIE_NAME, refreshed, COOKIE_OPTIONS);
      return res;
    }
  }

  // Slide the idle window
  const refreshedToken = await signSession(session);
  const response = NextResponse.next();
  response.cookies.set(COOKIE_NAME, refreshedToken, COOKIE_OPTIONS);

  return response;
}

export const config = {
  // Run on all routes except Next.js static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/|uploads/).*)'],
};
