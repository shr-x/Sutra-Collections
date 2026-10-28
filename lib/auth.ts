import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, COOKIE_NAME } from './session';
import { query } from './db';
import type { SessionPayload, Role } from '@/types';

/**
 * Read and verify the session from the request cookie. Returns null if
 * missing/invalid, or if the user has since been deactivated (SHRX console or
 * Settings → Users) — so deactivation takes effect on the very next request,
 * not when the 3-hour idle window lapses. (Middleware runs on the edge and
 * can't query the DB, so this server-side check is the enforcement point.)
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  const active = await query<{ is_active: boolean }>(
    'SELECT is_active FROM users WHERE id=$1', [session.userId]
  ).catch(() => null);
  // DB unreachable → keep the old behaviour (JWT alone) rather than locking everyone out.
  if (active && active.rows[0]?.is_active !== true) return null;
  return session;
}

/** Require an authenticated session. Redirects to /login if not present. */
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/**
 * Require the user to have one of the specified roles.
 * Admins always pass regardless of the roles listed.
 */
export async function requireRole(...roles: Role[]): Promise<SessionPayload> {
  const session = await requireAuth();
  if (session.role !== 'admin' && !roles.includes(session.role)) {
    redirect('/login?reason=unauthorized');
  }
  return session;
}

export const ROLE_HOME: Record<Role, string> = {
  admin: '/dashboard',
  staff: '/billing',
  accountant: '/accounting',
};
