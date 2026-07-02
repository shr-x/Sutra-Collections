/**
 * Super Admin auth — completely isolated from the regular session system.
 * Uses a separate JWT cookie (sutra-sa-session) and a separate DB table (super_admins).
 * Not linked from the regular app in any way.
 */
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';

export interface SASession {
  saId: string;
  saUsername: string;
}

const SA_COOKIE_NAME = 'sutra-sa-session';
// 8-hour non-sliding session for SA console
const SA_EXPIRY_SECONDS = 8 * 60 * 60;

const getSASecret = () =>
  new TextEncoder().encode(
    process.env.SA_SESSION_SECRET ?? 'sa-dev-secret-change-in-production-min32!!'
  );

export async function getSASession(): Promise<SASession | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(SA_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSASecret());
    return { saId: payload.saId as string, saUsername: payload.saUsername as string };
  } catch {
    return null;
  }
}

export async function requireSA(): Promise<SASession> {
  const sa = await getSASession();
  if (!sa) redirect('/sa-console-x7k2/login');
  return sa;
}

export async function saLogin(
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const res = await query<{ id: string; password_hash: string }>(
    'SELECT id, password_hash FROM super_admins WHERE username = $1',
    [username]
  );
  const row = res.rows[0];

  // Constant-time check even on missing user
  const dummyHash = '$2b$12$invalidhashfortimingprotection000000000000000000000';
  const match = row
    ? await bcrypt.compare(password, row.password_hash)
    : await bcrypt.compare(password, dummyHash);

  if (!row || !match) return { success: false, error: 'Invalid credentials' };

  const token = await new SignJWT({ saId: row.id, saUsername: username } as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SA_EXPIRY_SECONDS}s`)
    .sign(getSASecret());

  cookies().set(SA_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: SA_EXPIRY_SECONDS,
  });

  return { success: true };
}

export async function saLogout(): Promise<void> {
  cookies().delete(SA_COOKIE_NAME);
}
