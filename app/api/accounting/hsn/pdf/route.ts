import React from 'react';
import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const PURPLE = '#7C3AED';
const DARK   = '#111827';
const MUTED  = '#6B7280';
const RULE   = '#E5E7EB';

const S = StyleSheet.create({
  page:       { fontSize: 9, fontFamily: 'Helvetica', color: DARK, backgroundColor: '#FFF', padding: 35 },
  heading:    { fontSize: 15, fontFamily: 'Helvetica-Bold', color: PURPLE, marginBottom: 4 },
  subheading: { fontSize: 9, color: MUTED, marginBottom: 14 },
  rule:       { borderBottomWidth: 1, borderBottomColor: PURPLE, marginBottom: 10 },
  th:         { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  thead:      { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE, backgroundColor: '#F9FAFB' },
  trow:       { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  trowAlt:    { backgroundColor: '#F9FAFB' },
  tfoot:      { flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1.5, borderTopColor: RULE, backgroundColor: '#F3F4F6' },
  bold:       { fontFamily: 'Helvetica-Bold' },
  right:      { textAlign: 'right' },
  footer:     { position: 'absolute', bottom: 20, left: 35, right: 35, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
  footerText: { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  c0: { width: 70 },
  c1: { width: 50, textAlign: 'right' },
  c2: { width: 55, textAlign: 'right' },
  c3: { flex: 1, textAlign: 'right' },
  c4: { width: 65, textAlign: 'right' },
  c5: { width: 65, textAlign: 'right' },
  c6: { width: 70, textAlign: 'right' },
});

// Use Rs. prefix — Helvetica does not contain the Rs. glyph
function fmtInr(n: number) {
  return `Rs.${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
}

export async function GET(req: NextRequest) {
  await requireRole('accountant', 'admin');

  const { searchParams } = req.nextUrl;
  const month = searchParams.get('month') ?? '';
  const [y, m] = (month || `${new Date().getFullYear()}-${new Date().getMonth() + 1}`).split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

  const settRes = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('company_name','company_gstin')`
  );
  const cfg = Object.fromEntries(settRes.rows.map((r) => [r.key, r.value]));

  const res = await pool.query(
    `SELECT COALESCE(ii.hsn_code,'N/A') AS hsn_code, ii.gst_rate,
            SUM(ii.quantity)::numeric AS total_qty,
            SUM(ii.taxable_value) AS total_taxable,
            SUM(ii.cgst_amount) AS total_cgst,
            SUM(ii.sgst_amount) AS total_sgst,
            SUM(ii.total_amount) AS total_amount
     FROM invoice_items ii
     JOIN invoices i ON i.id = ii.invoice_id
     WHERE i.status NOT IN ('cancelled','draft') AND i.invoice_date BETWEEN $1 AND $2
     GROUP BY ii.hsn_code, ii.gst_rate
     ORDER BY total_amount DESC`,
    [from, to]
  );

  const rows = res.rows.map((r) => ({
    hsn_code:      r.hsn_code as string,
    gst_rate:      Number(r.gst_rate),
    total_qty:     Number(r.total_qty),
    total_taxable: Number(r.total_taxable),
    total_cgst:    Number(r.total_cgst),
    total_sgst:    Number(r.total_sgst),
    total_amount:  Number(r.total_amount),
  }));

  const grand = rows.reduce(
    (s, r) => ({ taxable: s.taxable + r.total_taxable, cgst: s.cgst + r.total_cgst, sgst: s.sgst + r.total_sgst, total: s.total + r.total_amount }),
    { taxable: 0, cgst: 0, sgst: 0, total: 0 }
  );

  const period = `${new Date(from).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', orientation: 'landscape', style: S.page },
      React.createElement(Text, { style: S.heading }, `${cfg.company_name ?? 'Sutra Collections'} — HSN-wise Summary`),
      React.createElement(Text, { style: S.subheading }, `GSTIN: ${cfg.company_gstin ?? '—'}  |  Period: ${period}  |  ${rows.length} HSN code(s)`),
      React.createElement(View, { style: S.rule }),

      // Header
      React.createElement(View, { style: S.thead },
        React.createElement(View, { style: S.c0 }, React.createElement(Text, { style: S.th }, 'HSN Code')),
        React.createElement(View, { style: S.c1 }, React.createElement(Text, { style: [S.th, S.right] }, 'GST %')),
        React.createElement(View, { style: S.c2 }, React.createElement(Text, { style: [S.th, S.right] }, 'Qty')),
        React.createElement(View, { style: S.c3 }, React.createElement(Text, { style: [S.th, S.right] }, 'Taxable')),
        React.createElement(View, { style: S.c4 }, React.createElement(Text, { style: [S.th, S.right] }, 'CGST')),
        React.createElement(View, { style: S.c5 }, React.createElement(Text, { style: [S.th, S.right] }, 'SGST')),
        React.createElement(View, { style: S.c6 }, React.createElement(Text, { style: [S.th, S.right] }, 'Total'))
      ),

      ...rows.map((row, i) =>
        React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
          React.createElement(View, { style: S.c0 }, React.createElement(Text, { style: S.bold }, row.hsn_code)),
          React.createElement(View, { style: S.c1 }, React.createElement(Text, { style: S.right }, `${row.gst_rate}%`)),
          React.createElement(View, { style: S.c2 }, React.createElement(Text, { style: S.right }, row.total_qty.toFixed(2))),
          React.createElement(View, { style: S.c3 }, React.createElement(Text, { style: S.right }, fmtInr(row.total_taxable))),
          React.createElement(View, { style: S.c4 }, React.createElement(Text, { style: S.right }, fmtInr(row.total_cgst))),
          React.createElement(View, { style: S.c5 }, React.createElement(Text, { style: S.right }, fmtInr(row.total_sgst))),
          React.createElement(View, { style: S.c6 }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(row.total_amount)))
        )
      ),

      // Footer totals
      React.createElement(View, { style: S.tfoot },
        React.createElement(View, { style: S.c0 }, React.createElement(Text, { style: S.bold }, `${rows.length} codes`)),
        React.createElement(View, { style: S.c1 }),
        React.createElement(View, { style: S.c2 }),
        React.createElement(View, { style: S.c3 }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(grand.taxable))),
        React.createElement(View, { style: S.c4 }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(grand.cgst))),
        React.createElement(View, { style: S.c5 }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(grand.sgst))),
        React.createElement(View, { style: S.c6 }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(grand.total)))
      ),

      React.createElement(View, { style: S.footer },
        React.createElement(Text, { style: S.footerText }, `Generated on ${new Date().toLocaleString('en-IN')}`)
      )
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await (renderToBuffer as any)(doc) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="hsn-summary-${month || 'export'}.pdf"`,
    },
  });
}
