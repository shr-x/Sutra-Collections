import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import pool from '@/lib/db';

interface InventoryRow {
  name: string; hsn_code: string; category?: string;
  gst_rate: string; unit: string; sizes?: string; colors?: string;
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');
    const body = await req.json() as { rows: InventoryRow[] };
    const { rows } = body;

    let saved = 0, skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.name.trim()) continue;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const dup = await client.query<{ id: string }>(
          `SELECT id FROM items WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
          [row.name.trim()]
        );
        if (dup.rows.length > 0) {
          // Item exists — add any new sizes/colors as variants; never create a duplicate product row.
          const existId = dup.rows[0].id;
          const sizeList = (row.sizes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          const colorList = (row.colors ?? '').split(',').map((c) => c.trim()).filter(Boolean);
          for (const sz of sizeList) {
            const has = await client.query(
              `SELECT 1 FROM item_sizes WHERE item_id=$1 AND LOWER(TRIM(size_name))=LOWER(TRIM($2)) LIMIT 1`,
              [existId, sz]
            );
            if (!has.rows.length) {
              const ord = await client.query<{ m: number }>(
                `SELECT COALESCE(MAX(sort_order),-1)+1 AS m FROM item_sizes WHERE item_id=$1`, [existId]
              );
              await client.query(
                `INSERT INTO item_sizes (item_id, size_name, is_default, sort_order) VALUES ($1,$2,FALSE,$3)`,
                [existId, sz, ord.rows[0].m]
              );
            }
          }
          for (const col of colorList) {
            const has = await client.query(
              `SELECT 1 FROM item_colors WHERE item_id=$1 AND LOWER(TRIM(color_name))=LOWER(TRIM($2)) LIMIT 1`,
              [existId, col]
            );
            if (!has.rows.length) {
              const ord = await client.query<{ m: number }>(
                `SELECT COALESCE(MAX(sort_order),-1)+1 AS m FROM item_colors WHERE item_id=$1`, [existId]
              );
              await client.query(
                `INSERT INTO item_colors (item_id, color_name, is_default, sort_order) VALUES ($1,$2,FALSE,$3)`,
                [existId, col, ord.rows[0].m]
              );
            }
          }
          await client.query('COMMIT');
          saved++;
          continue;
        }

        const gstRate = [0, 5, 12, 18, 28].includes(Number(row.gst_rate))
          ? Number(row.gst_rate) : 12;

        // Resolve the category by name — create it inline if new (#10).
        let categoryId: string | null = null;
        let itemType: 'finished' | 'raw_material' = 'finished';
        const catName = (row.category ?? '').trim();
        if (catName) {
          const found = await client.query<{ id: string; item_type: string }>(
            `SELECT id, item_type FROM item_categories WHERE LOWER(name)=LOWER($1) LIMIT 1`, [catName]
          );
          if (found.rows[0]) {
            categoryId = found.rows[0].id;
            itemType = found.rows[0].item_type === 'raw_material' ? 'raw_material' : 'finished';
          } else {
            const created = await client.query<{ id: string }>(
              `INSERT INTO item_categories (name, item_type) VALUES ($1,'finished') RETURNING id`, [catName]
            );
            categoryId = created.rows[0].id;
          }
        }

        const itemRes = await client.query<{ id: string }>(
          `INSERT INTO items (name, hsn_code, item_type, category_id, gst_rate, unit, is_active)
           VALUES ($1, NULLIF(TRIM($2),''), $3, $4, $5, $6, TRUE) RETURNING id`,
          [row.name.trim(), row.hsn_code, itemType, categoryId, gstRate, row.unit.trim() || 'pcs']
        );
        const itemId = itemRes.rows[0].id;

        // Sizes/colours: comma-separated → variant rows (first is default). (#10)
        const sizeList = (row.sizes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const colorList = (row.colors ?? '').split(',').map((c) => c.trim()).filter(Boolean);
        const sizes = sizeList.length ? sizeList : ['Regular'];
        const colors = colorList.length ? colorList : ['None'];
        for (let i = 0; i < sizes.length; i++) {
          await client.query(
            `INSERT INTO item_sizes (item_id, size_name, is_default, sort_order) VALUES ($1,$2,$3,$4)`,
            [itemId, sizes[i], i === 0, i]
          );
        }
        for (let i = 0; i < colors.length; i++) {
          await client.query(
            `INSERT INTO item_colors (item_id, color_name, is_default, sort_order) VALUES ($1,$2,$3,$4)`,
            [itemId, colors[i], i === 0, i]
          );
        }

        await client.query('COMMIT');
        saved++;
      } catch (err) {
        await client.query('ROLLBACK');
        errors.push(`${row.name}: ${err instanceof Error ? err.message : 'unknown'}`);
      } finally {
        client.release();
      }
    }

    return NextResponse.json({ saved, skipped, errors });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
