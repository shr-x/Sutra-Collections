import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { rows } = await query(
      `SELECT ii.id, ii.item_id, it.name AS item_name, ii.variant_id,
              COALESCE(iv.size, s.size_name) AS size,
              COALESCE(iv.color, c.color_name) AS color,
              ii.quantity, ii.rate, ii.gst_rate, ii.hsn_code
       FROM invoice_items ii
       JOIN items it ON it.id = ii.item_id
       LEFT JOIN item_variants iv ON iv.id = ii.variant_id
       LEFT JOIN item_sizes s ON s.id = ii.size_id
       LEFT JOIN item_colors c ON c.id = ii.color_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.sort_order`,
      [params.id]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[GET /api/invoices/[id]/items]', err);
    return NextResponse.json({ error: 'Failed to load items' }, { status: 500 });
  }
}
