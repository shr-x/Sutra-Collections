import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const warehouseId = req.nextUrl.searchParams.get('warehouse') || null;

  // Return stock by size+color combo. For old-style rows (size_id/color_id NULL),
  // map them to the default size+color for this item so they show up in the picker.
  const { rows } = await query(
    `SELECT
       COALESCE(s.size_id, def_sz.id) AS size_id,
       COALESCE(s.color_id, def_cl.id) AS color_id,
       SUM(s.quantity) AS quantity
     FROM stock s
     LEFT JOIN LATERAL (
       SELECT id FROM item_sizes WHERE item_id = $1 AND is_default = TRUE LIMIT 1
     ) def_sz ON TRUE
     LEFT JOIN LATERAL (
       SELECT id FROM item_colors WHERE item_id = $1 AND is_default = TRUE LIMIT 1
     ) def_cl ON TRUE
     WHERE s.item_id = $1
       AND ($2::uuid IS NULL OR s.warehouse_id = $2::uuid)
     GROUP BY COALESCE(s.size_id, def_sz.id), COALESCE(s.color_id, def_cl.id)`,
    [params.id, warehouseId]
  );

  // Build map of "sizeId:colorId" -> quantity (excluding entries where both are still null)
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (!row.size_id || !row.color_id) continue;
    const key = `${row.size_id}:${row.color_id}`;
    map[key] = (map[key] ?? 0) + Number(row.quantity);
  }

  return NextResponse.json(map);
}
