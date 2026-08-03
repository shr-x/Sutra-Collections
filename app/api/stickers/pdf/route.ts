import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { renderStickerSheet, type LabelSize, type StickerCode } from '@/lib/pdf/sticker-template';

interface StickerRow {
  code: string;
  item_name: string;
  price: string;
  size_name: string | null;
  color_name: string | null;
  purchase_date: string | null;
}

// Price is read LIVE from items.sale_price at generation time, never from
// sticker_codes.price (a historical snapshot of what the item's sale price
// was when the code was first created — kept in the table for that record,
// but never used for what actually prints) — so a sticker regenerated after
// the item's price was edited always reflects the current price.
const STICKER_SQL = `
  SELECT sc.code, it.name AS item_name, COALESCE(it.sale_price, 0)::text AS price,
         isz.size_name, ic.color_name,
         pi.purchase_date::text AS purchase_date
  FROM sticker_codes sc
  JOIN items it                ON it.id  = sc.item_id
  JOIN purchase_invoices pi    ON pi.id  = sc.purchase_invoice_id
  LEFT JOIN item_sizes  isz    ON isz.id = sc.size_id
  LEFT JOIN item_colors ic     ON ic.id  = sc.color_id
`;

function fmtDate(raw: string): string {
  return new Date(raw).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function GET(req: NextRequest) {
  try {
    await requireRole('admin', 'staff');
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp         = req.nextUrl.searchParams;
  const purchaseId = sp.get('purchaseId');
  const codes      = sp.get('codes')?.split(',').filter(Boolean) ?? [];
  const size       = (sp.get('size') ?? 's25') as LabelSize;
  const customWMM  = sp.get('wMM') ? Number(sp.get('wMM')) : undefined;
  const customHMM  = sp.get('hMM') ? Number(sp.get('hMM')) : undefined;

  if (size === 'custom') {
    const w = customWMM ?? 0, h = customHMM ?? 0;
    if (w < 5 || w > 200 || h < 5 || h > 200) {
      return NextResponse.json(
        { error: 'Custom size must be between 5mm and 200mm for both dimensions' },
        { status: 400 },
      );
    }
  }

  let rows: StickerRow[] = [];

  if (purchaseId) {
    const res = await query<StickerRow>(
      `${STICKER_SQL} WHERE sc.purchase_invoice_id = $1 ORDER BY sc.code`,
      [purchaseId],
    );
    rows = res.rows;
  } else if (codes.length > 0) {
    const res = await query<StickerRow>(
      `${STICKER_SQL} WHERE sc.code = ANY($1::text[]) ORDER BY sc.code`,
      [codes],
    );
    rows = res.rows;
  } else {
    return NextResponse.json({ error: 'Provide purchaseId or codes param' }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No stickers found' }, { status: 404 });
  }

  const stickers: StickerCode[] = rows.map((r) => ({
    code:      r.code,
    itemName:  r.item_name,
    price:     Number(r.price),
    sizeName:  r.size_name ?? undefined,
    colorName: r.color_name ?? undefined,
    date:      r.purchase_date ? fmtDate(r.purchase_date) : undefined,
  }));

  const buffer = await renderStickerSheet(stickers, size, undefined, customWMM, customHMM);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'inline; filename="stickers.pdf"',
    },
  });
}
