import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

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
       COALESCE(
         (SELECT SUM(st.quantity) FROM stock st WHERE st.item_id = i.id
          AND ($1::uuid IS NULL OR st.warehouse_id = $1::uuid)),
         0
       )::int AS stock_qty,
       -- Per-variant availability, keyed "sizeId:colorId", built from the SAME
       -- stock rows as stock_qty (so the variants always add up to the card
       -- total) and with the same legacy-NULL → default mapping as
       -- /api/items/[id]/stock-by-variant and the invoice pre-flight check.
       COALESCE((
         SELECT json_object_agg(v.k, v.q) FROM (
           SELECT COALESCE(st.size_id,  (SELECT id FROM item_sizes  WHERE item_id = i.id AND is_default = TRUE LIMIT 1))::text
                  || ':' ||
                  COALESCE(st.color_id, (SELECT id FROM item_colors WHERE item_id = i.id AND is_default = TRUE LIMIT 1))::text AS k,
                  SUM(st.quantity)::float AS q
           FROM stock st
           WHERE st.item_id = i.id AND ($1::uuid IS NULL OR st.warehouse_id = $1::uuid)
           GROUP BY 1
         ) v
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
