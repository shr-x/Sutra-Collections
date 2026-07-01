import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

function csv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export async function GET(req: NextRequest) {
  await requireRole('admin', 'accountant');

  const sp    = new URL(req.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from  = sp.get('from') ?? today.slice(0, 7) + '-01';
  const to    = sp.get('to')   ?? today;
  const sort  = sp.get('sort') === 'revenue' ? 'total_revenue' : 'total_qty';

  const conditions = [`i.invoice_date BETWEEN $1 AND $2`, `i.status NOT IN ('cancelled','draft')`];
  const params: unknown[] = [from, to];

  if (sp.get('warehouse_id')) { params.push(sp.get('warehouse_id')); conditions.push(`i.warehouse_id=$${params.length}`); }

  const res = await query(
    `SELECT it.name AS item_name, it.category, it.item_type,
            it.hsn_code, it.gst_rate,
            SUM(ii.quantity)                      AS total_qty,
            SUM(ii.total_amount)                  AS total_revenue,
            SUM(ii.cgst_amount + ii.sgst_amount)  AS total_gst,
            COUNT(DISTINCT i.id)                  AS invoice_count
     FROM invoice_items ii
     JOIN invoices i ON i.id=ii.invoice_id
     JOIN items it   ON it.id=ii.item_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY it.id, it.name, it.category, it.item_type, it.hsn_code, it.gst_rate
     ORDER BY ${sort} DESC LIMIT 200`,
    params
  );

  const header = ['Item','Category','Type','HSN','GST%','Qty Sold','Revenue','GST Collected','Invoices'];
  const data: string[][] = [
    header,
    ...res.rows.map((r) => [
      r.item_name, r.category ?? '', r.item_type, r.hsn_code ?? '',
      r.gst_rate, r.total_qty, r.total_revenue, r.total_gst, r.invoice_count,
    ]),
  ];

  return new NextResponse(csv(data), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="best-sellers-${from}-${to}.csv"`,
    },
  });
}
