'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query } from '@/lib/db';
import { signSession, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/session';
import { ROLE_HOME } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import type { Role } from '@/types';

const LoginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginState | null,
  formData: FormData
): Promise<LoginState> {
  // Validate inputs
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const { email, password } = parsed.data;

  // Fetch user (only active accounts can log in)
  const result = await query(
    `SELECT id, name, email, password_hash, role, warehouse_id, access_expires_at
     FROM users WHERE email = $1 AND COALESCE(is_active, TRUE) = TRUE LIMIT 1`,
    [email]
  );
  const user = result.rows[0];

  // Constant-time check to prevent user enumeration
  const dummyHash = '$2b$12$invalidhashfortimingprotection000000000000000000000';
  const passwordMatch = user
    ? await bcrypt.compare(password, user.password_hash)
    : await bcrypt.compare(password, dummyHash);

  if (!user || !passwordMatch) {
    return { error: 'Invalid email or password' };
  }

  // Time-boxed access check
  if (user.access_expires_at && new Date(user.access_expires_at) < new Date()) {
    return { error: 'Your access has expired. Contact the administrator.' };
  }

  // Create a DB session record for audit trail
  const sessionId = uuidv4();
  await query(
    `INSERT INTO sessions (id, user_id, expires_at, last_active_at)
     VALUES ($1, $2, NOW() + INTERVAL '3 hours', NOW())`,
    [sessionId, user.id]
  );

  // Issue JWT cookie
  const token = await signSession({
    userId: user.id,
    role: user.role as Role,
    warehouseId: user.warehouse_id ?? null,
    sessionId,
    accessExpiresAt: user.access_expires_at
      ? new Date(user.access_expires_at).getTime()
      : null,
    name: user.name,
    email: user.email,
  });

  cookies().set(COOKIE_NAME, token, COOKIE_OPTIONS);

  // Redirect outside try/catch so Next.js can handle it properly
  redirect(ROLE_HOME[user.role as Role] ?? '/dashboard');
}

export async function logoutAction(): Promise<void> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    // Remove DB session (best-effort)
    try {
      const { verifySession } = await import('@/lib/session');
      const session = await verifySession(token);
      if (session?.sessionId) {
        await query('DELETE FROM sessions WHERE id = $1', [session.sessionId]);
      }
    } catch {
      // Non-fatal
    }
  }

  cookieStore.delete(COOKIE_NAME);
  redirect('/login');
}
