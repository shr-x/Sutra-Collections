import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';

export async function GET(req: NextRequest) {
  await requireRole('accountant', 'admin');

  const { searchParams } = req.nextUrl;
  const month = searchParams.get('month') ?? '';
  const [y, m] = (month || `${new Date().getFullYear()}-${new Date().getMonth() + 1}`).split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

  const res = await pool.query(
    `SELECT
       COALESCE(ii.hsn_code, 'N/A') AS hsn_code,
       ii.gst_rate,
       SUM(ii.quantity)::numeric   AS total_qty,
       SUM(ii.taxable_value)       AS total_taxable,
       SUM(ii.cgst_amount)         AS total_cgst,
       SUM(ii.sgst_amount)         AS total_sgst,
       SUM(ii.total_amount)        AS total_amount
     FROM invoice_items ii
     JOIN invoices i ON i.id = ii.invoice_id
     WHERE i.status NOT IN ('cancelled','draft')
       AND i.invoice_date BETWEEN $1 AND $2
     GROUP BY ii.hsn_code, ii.gst_rate
     ORDER BY total_amount DESC`,
    [from, to]
  );

  const headers = ['HSN Code', 'GST Rate (%)', 'Total Quantity', 'Taxable Value', 'CGST', 'SGST', 'Total Amount'];
  const csvRows = [
    headers.join(','),
    ...res.rows.map((r) =>
      [
        r.hsn_code,
        r.gst_rate,
        r.total_qty,
        Number(r.total_taxable).toFixed(2),
        Number(r.total_cgst).toFixed(2),
        Number(r.total_sgst).toFixed(2),
        Number(r.total_amount).toFixed(2),
      ].join(',')
    ),
  ];

  return new NextResponse(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="HSN_Summary_${month}.csv"`,
    },
  });
}
