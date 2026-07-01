import { SignJWT, jwtVerify } from 'jose';
import type { SessionPayload } from '@/types';

const getSecret = () =>
  new TextEncoder().encode(
    process.env.SESSION_SECRET ?? 'dev-secret-change-in-production-min-32-chars!!'
  );

export const COOKIE_NAME = 'sutra_session';

// Idle timeout: 3 hours. Sliding window — refreshed on every request in middleware.
const IDLE_SECONDS = 3 * 60 * 60;

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${IDLE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
