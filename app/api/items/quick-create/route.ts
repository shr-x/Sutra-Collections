import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { pool } from '@/lib/db';

const ALLOWED_GST = new Set([0, 5, 12, 18, 28]);

/**
 * Lightweight product create used by the purchase AI-import flow when an
 * extracted line item has no matching product. Returns the new item so the
 * caller can immediately add it as a purchase line.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string; gst_rate?: number | string; hsn_code?: string | null;
    unit?: string; sale_price?: number | string | null; category_id?: string | null;
  };

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const gstNum = Number(body.gst_rate);
  const gst_rate = ALLOWED_GST.has(gstNum) ? gstNum : 0;
  const unit = (body.unit ?? '').trim() || 'pcs';
  const hsn_code = (body.hsn_code ?? null) || null;
  const salePrice = body.sale_price == null || body.sale_price === '' ? null : Number(body.sale_price);
  const sale_price = salePrice != null && !Number.isNaN(salePrice) ? salePrice : null;
  const category_id = (body.category_id ?? null) || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{
      id: string; name: string; gst_rate: string; hsn_code: string | null; unit: string; sale_price: string | null;
    }>(
      `INSERT INTO items (name, item_type, gst_rate, unit, hsn_code, sale_price, category_id, is_active)
       VALUES ($1,'finished',$2,$3,$4,$5,$6,TRUE)
       RETURNING id, name, gst_rate, hsn_code, unit, sale_price`,
      [name, gst_rate, unit, hsn_code, sale_price, category_id]
    );
    // Every item needs at least one size and one colour, or its stock can't be
    // recorded (lib/stock-variant.ts). Same defaults as Inventory → New Item.
    const size = await client.query<{ id: string; size_name: string; is_default: boolean }>(
      `INSERT INTO item_sizes (item_id, size_name, is_default, sort_order) VALUES ($1,'Regular',TRUE,0)
       RETURNING id, size_name, is_default`, [rows[0].id]
    );
    const color = await client.query<{ id: string; color_name: string; is_default: boolean }>(
      `INSERT INTO item_colors (item_id, color_name, is_default, sort_order) VALUES ($1,'Default',TRUE,0)
       RETURNING id, color_name, is_default`, [rows[0].id]
    );
    await client.query('COMMIT');
    return NextResponse.json({ ...rows[0], sizes: size.rows, colors: color.rows }, { status: 201 });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[POST /api/items/quick-create]', e);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  } finally {
    client.release();
  }
}
