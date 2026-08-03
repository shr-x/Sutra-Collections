import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireRole('admin', 'staff');
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const code = req.nextUrl.searchParams.get('code')?.trim().toUpperCase();
  if (!code) return NextResponse.json({ result: null });

  // Price is read LIVE from items.sale_price (not the sticker_codes.price
  // snapshot) so a lookup always matches what would actually print if this
  // code were regenerated right now.
  const res = await query<{
    code: string; item_name: string; price: string;
    purchase_number: string; purchase_date: string;
    size_name: string | null; color_name: string | null;
  }>(
    `SELECT sc.code, it.name AS item_name, COALESCE(it.sale_price, 0)::text AS price,
            pi.purchase_number, pi.purchase_date::text,
            isz.size_name, ic.color_name
     FROM sticker_codes sc
     JOIN items it                ON it.id  = sc.item_id
     JOIN purchase_invoices pi    ON pi.id  = sc.purchase_invoice_id
     LEFT JOIN item_sizes  isz    ON isz.id = sc.size_id
     LEFT JOIN item_colors ic     ON ic.id  = sc.color_id
     WHERE UPPER(sc.code) = $1`,
    [code],
  );

  return NextResponse.json({ result: res.rows[0] ?? null });
}
