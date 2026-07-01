import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';

export async function GET(req: NextRequest) {
  await requireRole('admin', 'accountant');

  const { searchParams } = req.nextUrl;
  const conditions = [
    `i.status IN ('issued','partially_paid')`,
    `i.grand_total > i.amount_paid`,
    `i.customer_id IS NOT NULL`,
  ];
  const params: unknown[] = [];

  const warehouse = searchParams.get('warehouse');
  const from      = searchParams.get('from');
  const to        = searchParams.get('to');

  if (warehouse) { params.push(warehouse); conditions.push(`i.warehouse_id = $${params.length}`); }
  if (from)      { params.push(from);      conditions.push(`i.invoice_date >= $${params.length}`); }
  if (to)        { params.push(to);        conditions.push(`i.invoice_date <= $${params.length}`); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const res = await pool.query(
    `SELECT
       c.name AS customer_name, c.phone,
       SUM(i.grand_total - i.amount_paid) AS total_outstanding,
       MIN(i.invoice_date) AS oldest_date,
       COUNT(i.id) AS invoice_count,
       SUM(CASE WHEN (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days')::date) BETWEEN 0 AND 30
                THEN i.grand_total - i.amount_paid ELSE 0 END) AS bucket_0_30,
       SUM(CASE WHEN (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days')::date) BETWEEN 31 AND 60
                THEN i.grand_total - i.amount_paid ELSE 0 END) AS bucket_31_60,
       SUM(CASE WHEN (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days')::date) BETWEEN 61 AND 90
                THEN i.grand_total - i.amount_paid ELSE 0 END) AS bucket_61_90,
       SUM(CASE WHEN (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days')::date) > 90
                THEN i.grand_total - i.amount_paid ELSE 0 END) AS bucket_90_plus
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     ${where}
     GROUP BY c.id, c.name, c.phone
     HAVING SUM(i.grand_total - i.amount_paid) > 0
     ORDER BY total_outstanding DESC`,
    params
  );

  const headers = ['Customer Name', 'Phone', 'Total Outstanding', 'Invoices', 'Oldest Invoice', '0-30 Days', '31-60 Days', '61-90 Days', '90+ Days'];
  const csvRows = [
    headers.join(','),
    ...res.rows.map((r) =>
      [
        `"${r.customer_name}"`,
        r.phone ?? '',
        Number(r.total_outstanding).toFixed(2),
        r.invoice_count,
        r.oldest_date,
        Number(r.bucket_0_30).toFixed(2),
        Number(r.bucket_31_60).toFixed(2),
        Number(r.bucket_61_90).toFixed(2),
        Number(r.bucket_90_plus).toFixed(2),
      ].join(',')
    ),
  ];

  return new NextResponse(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="Outstanding_Dues.csv"`,
    },
  });
}
