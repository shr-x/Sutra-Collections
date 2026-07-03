import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await query(
    'SELECT id, color_name, is_default, sort_order FROM item_colors WHERE item_id=$1 ORDER BY sort_order, color_name',
    [params.id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { color_name?: string };
  const color_name = body.color_name?.trim();
  if (!color_name) return NextResponse.json({ error: 'Color name is required' }, { status: 400 });

  // Idempotent: return the existing record if the same name already exists (case-insensitive).
  // Prevents duplicates when the variant modal saves multiple rows that share a colour name,
  // or when "Add Variant" is called more than once for the same product.
  const existing = await query<{ id: string; color_name: string; is_default: boolean; sort_order: number }>(
    `SELECT id, color_name, is_default, sort_order FROM item_colors
     WHERE item_id=$1 AND LOWER(TRIM(color_name))=LOWER(TRIM($2)) LIMIT 1`,
    [params.id, color_name]
  );
  if (existing.rows.length > 0) return NextResponse.json(existing.rows[0]);

  const countRes = await query('SELECT COUNT(*) FROM item_colors WHERE item_id=$1', [params.id]);
  const sortOrder = Number(countRes.rows[0].count);

  try {
    const { rows } = await query<{ id: string; color_name: string; is_default: boolean; sort_order: number }>(
      `INSERT INTO item_colors (item_id, color_name, is_default, sort_order)
       VALUES ($1,$2,false,$3) RETURNING id, color_name, is_default, sort_order`,
      [params.id, color_name, sortOrder]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch {
    // Race condition: concurrent request inserted the same name — return it
    const { rows } = await query<{ id: string; color_name: string; is_default: boolean; sort_order: number }>(
      `SELECT id, color_name, is_default, sort_order FROM item_colors
       WHERE item_id=$1 AND LOWER(TRIM(color_name))=LOWER(TRIM($2)) LIMIT 1`,
      [params.id, color_name]
    );
    if (rows.length > 0) return NextResponse.json(rows[0]);
    return NextResponse.json({ error: 'Failed to create colour' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const colorId = url.searchParams.get('color_id');
  if (!colorId) return NextResponse.json({ error: 'color_id required' }, { status: 400 });

  const stockCheck = await query('SELECT COUNT(*) FROM stock WHERE color_id=$1 AND quantity > 0', [colorId]);
  if (Number(stockCheck.rows[0].count) > 0) {
    return NextResponse.json({ error: 'Cannot delete color with stock' }, { status: 409 });
  }

  await query('DELETE FROM item_colors WHERE id=$1 AND item_id=$2', [colorId, params.id]);
  return NextResponse.json({ ok: true });
}
