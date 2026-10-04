import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { taxableSql } from '@/lib/gstr';

// Escapes a value for a CSV cell: quotes it and doubles any embedded quotes.
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  await requireRole('accountant', 'admin');

  const { searchParams } = req.nextUrl;
  const month = searchParams.get('month') ?? '';
  const format = searchParams.get('format'); // 'json' or null (CSV)
  const [y, m] = (month || `${new Date().getFullYear()}-${new Date().getMonth() + 1}`).split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

  // Outward GST invoices only. Non-GST invoices are not tax invoices and are
  // reported separately as nil / non-GST supplies.
  const res = await pool.query(
    `SELECT i.invoice_number,
            to_char(i.invoice_date, 'DD-MM-YYYY') AS invoice_date,
            COALESCE(i.customer_name_snapshot, c.name, 'Walk-in') AS customer_name,
            COALESCE(i.customer_gstin_snapshot, c.gstin, '') AS gstin,
            ${taxableSql('i')}::numeric(12,2) AS taxable_value,
            i.total_cgst, i.total_sgst, i.grand_total
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.status NOT IN ('cancelled','draft')
       AND i.invoice_type = 'gst'
       AND i.invoice_date BETWEEN $1 AND $2
     ORDER BY i.invoice_date, i.invoice_number`,
    [from, to]
  );

  // Credit notes (CDNR when the buyer has a GSTIN, otherwise CDNUR). Dated by
  // the IST calendar day they were issued, matching GSTR-3B.
  const cnRes = await pool.query(
    `SELECT cn.credit_note_number,
            to_char(cn.created_at AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY') AS note_date,
            i.invoice_number AS original_invoice,
            to_char(i.invoice_date, 'DD-MM-YYYY') AS original_invoice_date,
            COALESCE(c.gstin, '') AS gstin,
            ${taxableSql('cn')}::numeric(12,2) AS taxable_value,
            cn.total_cgst, cn.total_sgst, cn.grand_total
     FROM credit_notes cn
     LEFT JOIN invoices i ON i.id = cn.invoice_id
     LEFT JOIN customers c ON c.id = cn.customer_id
     WHERE cn.status IN ('issued','settled')
       AND (cn.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
     ORDER BY cn.created_at, cn.credit_note_number`,
    [from, to]
  );

  const nonGstRes = await pool.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(grand_total), 0)::numeric(12,2) AS value
     FROM invoices
     WHERE status NOT IN ('cancelled','draft')
       AND invoice_type = 'non_gst'
       AND invoice_date BETWEEN $1 AND $2`,
    [from, to]
  );
  const nonGst = nonGstRes.rows[0];

  if (format === 'json') {
    const jsonRows = res.rows.map((r) => ({
      invoice_number: r.invoice_number,
      invoice_date:   r.invoice_date,
      customer_name:  r.customer_name,
      gstin:          r.gstin || null,
      taxable_value:  Number(r.taxable_value),
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

  const lines: string[] = [];
  lines.push(['Invoice Number', 'Invoice Date', 'Customer Name', 'GSTIN', 'Taxable Value', 'CGST', 'SGST', 'Grand Total'].join(','));
  for (const r of res.rows) {
    lines.push([
      r.invoice_number,
      r.invoice_date,
      csvCell(r.customer_name),
      r.gstin,
      Number(r.taxable_value).toFixed(2),
      Number(r.total_cgst).toFixed(2),
      Number(r.total_sgst).toFixed(2),
      Number(r.grand_total).toFixed(2),
    ].join(','));
  }

  lines.push('');
  lines.push('Credit Notes');
  lines.push(['Note Number', 'Note Date', 'Original Invoice', 'Original Invoice Date', 'Customer GSTIN', 'Taxable Value', 'CGST', 'SGST', 'Grand Total'].join(','));
  for (const r of cnRes.rows) {
    lines.push([
      r.credit_note_number,
      r.note_date,
      r.original_invoice ?? '',
      r.original_invoice_date ?? '',
      r.gstin,
      Number(r.taxable_value).toFixed(2),
      Number(r.total_cgst).toFixed(2),
      Number(r.total_sgst).toFixed(2),
      Number(r.grand_total).toFixed(2),
    ].join(','));
  }

  lines.push('');
  lines.push('Non-GST Invoices (excluded from taxable outward supplies)');
  lines.push(['Count', 'Grand Total'].join(','));
  lines.push([nonGst.count, Number(nonGst.value).toFixed(2)].join(','));

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="GSTR1_${month}.csv"`,
    },
  });
}
