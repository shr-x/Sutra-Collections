import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/session';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST() {
  const session = await getSession();

  if (session?.sessionId) {
    // Delete the DB session record (best-effort — don't fail logout if DB is slow)
    query('DELETE FROM sessions WHERE id = $1', [session.sessionId]).catch(() => {});
  }

  cookies().delete(COOKIE_NAME);

  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'));
}
