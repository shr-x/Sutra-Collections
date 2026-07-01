import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const unitRow = await query('SELECT name FROM item_units WHERE id=$1', [params.id]);
  if (!unitRow.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { rows } = await query(
    'SELECT COUNT(*) FROM items WHERE unit=$1', [unitRow.rows[0].name]
  );
  if (Number(rows[0].count) > 0) {
    return NextResponse.json({ error: 'Unit is in use by items' }, { status: 409 });
  }

  await query('DELETE FROM item_units WHERE id=$1', [params.id]);
  return NextResponse.json({ ok: true });
}
