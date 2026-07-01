import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

function csv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export async function GET(req: NextRequest) {
  await requireRole('admin', 'accountant');
  const date = new URL(req.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  const [salesRes, purchaseRes, expRes] = await Promise.all([
    query(
      `SELECT i.invoice_number, i.invoice_date, COALESCE(c.name,'Walk-in') AS party,
              i.payment_mode, i.grand_total, i.status
       FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
       WHERE i.invoice_date=$1 AND i.status <> 'cancelled' ORDER BY i.created_at`,
      [date]
    ),
    // purchase_invoices uses purchase_number / purchase_date (not invoice_*)
    query(
      `SELECT p.purchase_number AS invoice_number, p.purchase_date AS invoice_date,
              COALESCE(s.name,'—') AS party,
              p.payment_mode, p.grand_total, p.status
       FROM purchase_invoices p LEFT JOIN suppliers s ON s.id=p.supplier_id
       WHERE p.purchase_date=$1 ORDER BY p.created_at`,
      [date]
    ),
    // expenses has no reference_number column
    query(
      `SELECT NULL AS reference_number, e.expense_date, e.description AS party,
              e.payment_mode, e.amount
       FROM expenses e WHERE e.expense_date=$1 ORDER BY e.created_at`,
      [date]
    ),
  ]);

  const header = ['Type', 'Reference', 'Date', 'Party', 'Mode', 'Amount', 'Direction'];
  const data: string[][] = [
    header,
    ...salesRes.rows.map((r) => ['Sale', r.invoice_number, r.invoice_date, r.party, r.payment_mode ?? '', r.grand_total, 'In']),
    ...purchaseRes.rows.map((r) => ['Purchase', r.invoice_number ?? '', r.invoice_date, r.party, r.payment_mode ?? '', r.grand_total, 'Out']),
    ...expRes.rows.map((r) => ['Expense', r.reference_number ?? '', r.expense_date, r.party, r.payment_mode ?? '', r.amount, 'Out']),
  ];

  return new NextResponse(csv(data), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="daybook-${date}.csv"`,
    },
  });
}
