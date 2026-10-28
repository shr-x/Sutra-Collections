import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { setUserActive } from '@/lib/users';
import { requireShrx, shrxAudit } from '@/lib/shrx/session';

// Users are never hard-deleted (invoices and other tables reference users.id):
// reset password, deactivate, reactivate.
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reset_password'), password: z.string().min(8, 'Temporary password must be at least 8 characters').max(128) }),
  z.object({ action: z.literal('deactivate') }),
  z.object({ action: z.literal('reactivate') }),
]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const user = (await query<{ email: string }>('SELECT email FROM users WHERE id=$1', [params.id])).rows[0];
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const b = parsed.data;
  if (b.action === 'reset_password') {
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(b.password, 12), params.id]);
    // Sign them out everywhere; they log in with the temporary password.
    await query('DELETE FROM sessions WHERE user_id=$1', [params.id]);
    await shrxAudit('user.reset_password', user.email, { id: params.id }, g.ip);
    return NextResponse.json({ ok: true });
  }

  const res = await setUserActive(params.id, b.action === 'reactivate');
  if (!res.ok) {
    await shrxAudit(`user.${b.action}.refused`, user.email, { id: params.id, reason: res.error }, g.ip);
    return NextResponse.json({ error: res.error }, { status: 409 });
  }
  await shrxAudit(`user.${b.action}`, user.email, { id: params.id }, g.ip);
  return NextResponse.json({ ok: true });
}
