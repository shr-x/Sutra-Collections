import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { rows } = await query('SELECT COUNT(*) FROM items WHERE category_id=$1', [params.id]);
  if (Number(rows[0].count) > 0) {
    return NextResponse.json({ error: 'Category is in use by items' }, { status: 409 });
  }

  await query('DELETE FROM item_categories WHERE id=$1', [params.id]);
  return NextResponse.json({ ok: true });
}
