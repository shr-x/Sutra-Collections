import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { requireShrx, shrxAudit } from '@/lib/shrx/session';

export async function GET(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const [users, warehouses] = await Promise.all([
    query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.access_expires_at, w.name AS warehouse_name
       FROM users u LEFT JOIN warehouses w ON w.id = u.warehouse_id
       ORDER BY u.is_active DESC, u.role, u.name`
    ),
    query('SELECT id, name FROM warehouses WHERE is_active = TRUE ORDER BY name'),
  ]);
  return NextResponse.json({ users: users.rows, warehouses: warehouses.rows });
}

const NewUser = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(['admin', 'staff', 'accountant']),
  password: z.string().min(8, 'Temporary password must be at least 8 characters').max(128),
  warehouse_id: z.string().uuid().nullable().optional(),
}).refine((u) => u.role !== 'staff' || !!u.warehouse_id, { message: 'Staff must be assigned a warehouse', path: ['warehouse_id'] });

export async function POST(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const parsed = NewUser.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const u = parsed.data;
  const dup = await query('SELECT 1 FROM users WHERE LOWER(email) = $1', [u.email]);
  if (dup.rows.length) return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 409 });
  const hash = await bcrypt.hash(u.password, 12);
  const res = await query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role, warehouse_id, is_active)
     VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id`,
    [u.name, u.email, hash, u.role, u.role === 'staff' ? u.warehouse_id : null]
  );
  // Never log the password.
  await shrxAudit('user.create', u.email, { id: res.rows[0].id, name: u.name, role: u.role }, g.ip);
  return NextResponse.json({ ok: true, id: res.rows[0].id });
}
