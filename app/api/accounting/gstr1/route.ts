import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';

export async function GET(req: NextRequest) {
  await requireRole('accountant', 'admin');

  const { searchParams } = req.nextUrl;
  const month = searchParams.get('month') ?? '';
  const format = searchParams.get('format'); // 'json' or null (CSV)
  const [y, m] = (month || `${new Date().getFullYear()}-${new Date().getMonth() + 1}`).split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

  const res = await pool.query(
    `SELECT i.invoice_number, i.invoice_date,
            COALESCE(i.customer_name_snapshot, c.name, 'Walk-in') AS customer_name,
            COALESCE(i.customer_gstin_snapshot, c.gstin, '') AS gstin,
            i.subtotal, i.total_cgst, i.total_sgst, i.grand_total
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.status NOT IN ('cancelled','draft')
       AND i.invoice_date BETWEEN $1 AND $2
     ORDER BY i.invoice_date, i.invoice_number`,
    [from, to]
  );

  if (format === 'json') {
    const jsonRows = res.rows.map((r) => ({
      invoice_number: r.invoice_number,
      invoice_date:   r.invoice_date,
      customer_name:  r.customer_name,
      gstin:          r.gstin || null,
      taxable_value:  Number(r.subtotal),
      cgst:           Number(r.total_cgst),
      sgst:           Number(r.total_sgst),
      grand_total:    Number(r.grand_total),
    }));
    return new NextResponse(JSON.stringify(jsonRows, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="GSTR1_${month}.json"`,
      },
    });
  }

  const headers = ['Invoice Number', 'Invoice Date', 'Customer Name', 'GSTIN', 'Taxable Value', 'CGST', 'SGST', 'Grand Total'];
  const csvRows = [
    headers.join(','),
    ...res.rows.map((r) =>
      [
        r.invoice_number,
        r.invoice_date,
        `"${r.customer_name}"`,
        r.gstin,
        Number(r.subtotal).toFixed(2),
        Number(r.total_cgst).toFixed(2),
        Number(r.total_sgst).toFixed(2),
        Number(r.grand_total).toFixed(2),
      ].join(',')
    ),
  ];

  return new NextResponse(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="GSTR1_${month}.csv"`,
    },
  });
}
