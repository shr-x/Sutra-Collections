import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS fabric_options (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET() {
  try {
    await requireRole('admin', 'staff');
    await ensureTable();
    const { rows } = await query<{ id: string; name: string }>(
      `SELECT id, name FROM fabric_options ORDER BY name`
    );
    return NextResponse.json({ options: rows });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin', 'staff');
    await ensureTable();
    const body = await req.json() as { name?: unknown };
    const name = z.string().min(1).max(100).parse(body.name);
    const { rows } = await query<{ id: string; name: string }>(
      `INSERT INTO fabric_options (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [name.trim()]
    );
    return NextResponse.json({ option: rows[0] });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('admin', 'staff');
    const body = await req.json() as { id?: unknown };
    const id = z.string().uuid().parse(body.id);
    await query(`DELETE FROM fabric_options WHERE id=$1`, [id]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
