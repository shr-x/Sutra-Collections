import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, COOKIE_NAME } from './session';
import type { SessionPayload, Role } from '@/types';

/** Read and verify the session from the request cookie. Returns null if missing/invalid. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
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
