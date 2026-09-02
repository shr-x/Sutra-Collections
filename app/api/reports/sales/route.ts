import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

function csv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export async function GET(req: NextRequest) {
  await requireRole('admin', 'accountant');

  const sp   = new URL(req.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from  = sp.get('from') ?? today.slice(0, 7) + '-01';
  const to    = sp.get('to')   ?? today;

  const conditions = [`i.invoice_date BETWEEN $1 AND $2`, `i.status NOT IN ('cancelled','draft')`];
  const params: unknown[] = [from, to];

  if (sp.get('warehouse_id')) { params.push(sp.get('warehouse_id')); conditions.push(`i.warehouse_id=$${params.length}`); }
  if (sp.get('created_by'))   { params.push(sp.get('created_by'));   conditions.push(`i.created_by=$${params.length}`); }
  // Mirrors the ?mode= toggle on the Sales Report page (invoices.source: 'pos' | 'tailoring').
  const mode = sp.get('mode');
  if (mode === 'retail' || mode === 'tailoring') {
    params.push(mode === 'retail' ? 'pos' : 'tailoring');
    conditions.push(`i.source=$${params.length}`);
  }

  const res = await query(
    `SELECT i.invoice_number, i.invoice_date, i.status,
            COALESCE(c.name,'Walk-in') AS customer,
            i.payment_mode, i.grand_total, i.amount_paid,
            i.invoice_discount_amount, i.total_cgst, i.total_sgst,
            w.name AS warehouse, u.name AS created_by
     FROM invoices i
     LEFT JOIN customers c ON c.id=i.customer_id
     LEFT JOIN warehouses w ON w.id=i.warehouse_id
     LEFT JOIN users u ON u.id=i.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY i.invoice_date, i.invoice_number`,
    params
  );

  const header = ['Invoice No.','Date','Status','Customer','Warehouse','Mode','Grand Total','Amount Paid','Discount','CGST','SGST','Created By'];
  const data: string[][] = [
    header,
    ...res.rows.map((r) => [
      r.invoice_number, r.invoice_date, r.status, r.customer,
      r.warehouse ?? '', r.payment_mode ?? '', r.grand_total, r.amount_paid,
      r.invoice_discount_amount, r.total_cgst, r.total_sgst, r.created_by ?? '',
    ]),
  ];

  return new NextResponse(csv(data), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="sales-${from}-${to}.csv"`,
    },
  });
}
