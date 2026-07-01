import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const SetupSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8),
});

// One-time bootstrap — only works while super_admins table is empty.
// Once any super admin exists, this endpoint returns 403.
export async function POST(req: NextRequest) {
  // Guard: reject if any super admin already exists
  const countRes = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM super_admins');
  if (parseInt(countRes.rows[0]?.count ?? '0', 10) > 0) {
    return NextResponse.json({ error: 'Super admin already exists. Use the console to manage accounts.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 422 });
  }

  const { username, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  await query(
    'INSERT INTO super_admins (username, password_hash) VALUES ($1, $2)',
    [username, passwordHash]
  );

  return NextResponse.json({ success: true, message: `Super admin '${username}' created. This endpoint is now permanently disabled.` });
}
