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

  // purchase_invoices uses purchase_date / purchase_number (not invoice_*)
  const conditions = [`p.purchase_date BETWEEN $1 AND $2`];
  const params: unknown[] = [from, to];

  if (sp.get('supplier_id')) { params.push(sp.get('supplier_id')); conditions.push(`p.supplier_id=$${params.length}`); }

  const res = await query(
    `SELECT p.purchase_number, p.purchase_date, p.status,
            COALESCE(s.name,'—') AS supplier,
            p.payment_mode, p.grand_total, p.amount_paid,
            p.total_cgst, p.total_sgst
     FROM purchase_invoices p
     LEFT JOIN suppliers s ON s.id=p.supplier_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.purchase_date, p.purchase_number`,
    params
  );

  const header = ['Purchase No.','Date','Status','Supplier','Mode','Grand Total','Amount Paid','CGST','SGST'];
  const data: string[][] = [
    header,
    ...res.rows.map((r) => [
      r.purchase_number ?? '', r.purchase_date, r.status, r.supplier,
      r.payment_mode ?? '', r.grand_total, r.amount_paid, r.total_cgst, r.total_sgst,
    ]),
  ];

  return new NextResponse(csv(data), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="purchases-${from}-${to}.csv"`,
    },
  });
}
