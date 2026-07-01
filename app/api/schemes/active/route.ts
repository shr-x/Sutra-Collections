import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await query(
    `SELECT ds.id, ds.name, ds.scheme_type, ds.discount_value, ds.min_order_value,
            ds.valid_from, ds.valid_until,
            bi.name AS buy_item_name, gi.name AS get_item_name,
            ds.buy_quantity, ds.get_quantity
     FROM discount_schemes ds
     LEFT JOIN items bi ON bi.id = ds.buy_item_id
     LEFT JOIN items gi ON gi.id = ds.get_item_id
     WHERE ds.is_active = TRUE
       AND (ds.valid_until IS NULL OR ds.valid_until >= CURRENT_DATE)
       AND (ds.valid_from IS NULL OR ds.valid_from <= CURRENT_DATE)
     ORDER BY ds.name`
  );

  return NextResponse.json(rows);
}
