import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { effectiveSizeSql, effectiveColorSql } from '@/lib/stock-sql';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const warehouseId = req.nextUrl.searchParams.get('warehouse') || null;

  // Stock by size+colour for one item, attributing legacy NULL rows exactly
  // like the picker (lib/stock-sql.ts) so the two always agree.
  const { rows } = await query(
    `SELECT ${effectiveSizeSql('s', '$1')} AS size_id,
            ${effectiveColorSql('s', '$1')} AS color_id,
            SUM(s.quantity) AS quantity
     FROM stock s
     WHERE s.item_id = $1
       AND ($2::uuid IS NULL OR s.warehouse_id = $2::uuid)
     GROUP BY 1, 2`,
    [params.id, warehouseId]
  );

  // Build map of "sizeId:colorId" -> quantity (rows that still can't be attributed — an item with no options at all — are skipped)
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (!row.size_id || !row.color_id) continue;
    const key = `${row.size_id}:${row.color_id}`;
    map[key] = (map[key] ?? 0) + Number(row.quantity);
  }

  return NextResponse.json(map);
}
