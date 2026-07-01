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

        const dup = await client.query(
          `SELECT id FROM items WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [row.name.trim()]
        );
        if (dup.rows.length > 0) {
          skipped++;
          await client.query('ROLLBACK');
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
