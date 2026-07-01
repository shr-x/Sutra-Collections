import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { z } from 'zod';

const SupplierSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(20).nullable().optional(),
  gstin: z.string().max(15).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role === 'accountant') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = SupplierSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const { name, phone, gstin, address } = parsed.data;
  try {
    // suppliers.phone is NOT NULL — default blank to '' instead of null.
    const res = await query<{ id: string }>(
      `INSERT INTO suppliers (name, phone, gstin, address) VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, phone ?? '', gstin ?? null, address ?? '']
    );
    return NextResponse.json({ id: res.rows[0].id, name });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}
