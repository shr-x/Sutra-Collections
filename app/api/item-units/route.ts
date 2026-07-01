import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await query('SELECT id, name FROM item_units ORDER BY name');
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  try {
    const { rows } = await query(
      'INSERT INTO item_units (name) VALUES ($1) RETURNING id, name',
      [name]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unit name already exists' }, { status: 409 });
  }
}
