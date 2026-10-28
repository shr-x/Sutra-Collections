import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { effectiveSizeSql, effectiveColorSql } from '@/lib/stock-sql';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const warehouseId = req.nextUrl.searchParams.get('warehouse') || null;

  const { rows } = await query(
    `SELECT i.id, i.name, i.unit, i.gst_rate, i.hsn_code, i.item_type, i.sale_price, i.photo_url,
            i.low_stock_threshold, i.category_id,
            ic_cat.name AS category_name,
       COALESCE(json_agg(DISTINCT jsonb_build_object('id', s.id, 'size_name', s.size_name, 'is_default', s.is_default))
         FILTER (WHERE s.id IS NOT NULL), '[]') AS sizes,
       COALESCE(json_agg(DISTINCT jsonb_build_object('id', c.id, 'color_name', c.color_name, 'is_default', c.is_default))
         FILTER (WHERE c.id IS NOT NULL), '[]') AS colors,
       -- Stock in the selected warehouse (all warehouses when none is selected).
       COALESCE(
         (SELECT SUM(st.quantity) FROM stock st WHERE st.item_id = i.id
          AND ($1::uuid IS NULL OR st.warehouse_id = $1::uuid)),
         0
       )::float AS stock_qty,
       -- Across ALL warehouses — the figure Inventory → Items shows.
       COALESCE((SELECT SUM(st.quantity) FROM stock st WHERE st.item_id = i.id), 0)::float AS stock_qty_all,
       -- Per-variant availability in the selected warehouse, keyed
       -- "sizeId:colorId". Built from the same rows as stock_qty, with legacy
       -- NULL size/colour rows attributed by lib/stock-sql.ts, so the variants
       -- add up to the card total. Rows that still can't be attributed (an
       -- item with no size/colour at all) are skipped here instead of making
       -- json_object_agg fail the whole picker on a NULL key.
       COALESCE((
         SELECT json_object_agg(v.k, v.q) FROM (
           SELECT ${effectiveSizeSql('st', 'i.id')}::text || ':' || ${effectiveColorSql('st', 'i.id')}::text AS k,
                  SUM(st.quantity)::float AS q
           FROM stock st
           WHERE st.item_id = i.id AND ($1::uuid IS NULL OR st.warehouse_id = $1::uuid)
           GROUP BY 1
         ) v
         WHERE v.k IS NOT NULL
       ), '{}'::json) AS variant_stock
     FROM items i
     LEFT JOIN item_sizes s ON s.item_id = i.id
     LEFT JOIN item_colors c ON c.item_id = i.id
     LEFT JOIN item_categories ic_cat ON ic_cat.id = i.category_id
     WHERE i.is_active = TRUE
     GROUP BY i.id, ic_cat.name
     ORDER BY i.item_type, i.name`,
    [warehouseId]
  );

  return NextResponse.json(rows);
}
