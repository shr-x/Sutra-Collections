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
  heading:    { fontSize: 16, fontFamily: 'Helvetica-Bold', color: PURPLE, marginBottom: 4 },
  subheading: { fontSize: 9, color: MUTED, marginBottom: 16 },
  rule:       { borderBottomWidth: 1, borderBottomColor: PURPLE, marginBottom: 12 },
  greyRule:   { borderBottomWidth: 0.5, borderBottomColor: RULE, marginBottom: 8 },
  th:         { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  thead:      { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE, backgroundColor: '#F9FAFB' },
  trow:       { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  trowAlt:    { backgroundColor: '#F9FAFB' },
  tfoot:      { flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1.5, borderTopColor: RULE, backgroundColor: '#F3F4F6' },
  bold:       { fontFamily: 'Helvetica-Bold' },
  right:      { textAlign: 'right' },
  footer:     { position: 'absolute', bottom: 20, left: 35, right: 35, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
  footerText: { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  // column widths
  c0: { width: 25 },
  c1: { width: 80 },
  c2: { width: 60 },
  c3: { flex: 1 },
  c4: { width: 80 },
  c5: { width: 55 },
  c6: { width: 55 },
  c7: { width: 55 },
  c8: { width: 60 },
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

  // Company info
  const settRes = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('company_name','company_gstin')`
  );
  const cfg = Object.fromEntries(settRes.rows.map((r) => [r.key, r.value]));

  const res = await pool.query(
    `SELECT i.invoice_number, i.invoice_date,
            COALESCE(i.customer_name_snapshot, c.name, 'Walk-in') AS customer_name,
            COALESCE(i.customer_gstin_snapshot, c.gstin, '') AS gstin,
            i.subtotal::numeric, i.total_cgst::numeric, i.total_sgst::numeric, i.grand_total::numeric
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.status NOT IN ('cancelled','draft')
       AND i.invoice_date BETWEEN $1 AND $2
     ORDER BY i.invoice_date, i.invoice_number`,
    [from, to]
  );

  const rows = res.rows.map((r) => ({
    ...r,
    subtotal:    Number(r.subtotal),
    total_cgst:  Number(r.total_cgst),
    total_sgst:  Number(r.total_sgst),
    grand_total: Number(r.grand_total),
  }));

  const totals = rows.reduce(
    (s, r) => ({ taxable: s.taxable + r.subtotal, cgst: s.cgst + r.total_cgst, sgst: s.sgst + r.total_sgst, total: s.total + r.grand_total }),
    { taxable: 0, cgst: 0, sgst: 0, total: 0 }
  );

  const period = `${new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', orientation: 'landscape', style: S.page },
      // Header
      React.createElement(Text, { style: S.heading }, `${cfg.company_name ?? 'Sutra Collections'} — GSTR-1 Sales Register`),
      React.createElement(Text, { style: S.subheading }, `GSTIN: ${cfg.company_gstin ?? '—'}  |  Period: ${period}  |  ${rows.length} invoice(s)`),
      React.createElement(View, { style: S.rule }),
      // Table header
      React.createElement(View, { style: S.thead },
        React.createElement(View, { style: S.c0 }, React.createElement(Text, { style: S.th }, '#')),
        React.createElement(View, { style: S.c1 }, React.createElement(Text, { style: S.th }, 'Invoice No.')),
        React.createElement(View, { style: S.c2 }, React.createElement(Text, { style: S.th }, 'Date')),
        React.createElement(View, { style: S.c3 }, React.createElement(Text, { style: S.th }, 'Customer')),
        React.createElement(View, { style: S.c4 }, React.createElement(Text, { style: S.th }, 'GSTIN')),
        React.createElement(View, { style: S.c5 }, React.createElement(Text, { style: [S.th, S.right] }, 'Taxable')),
        React.createElement(View, { style: S.c6 }, React.createElement(Text, { style: [S.th, S.right] }, 'CGST')),
        React.createElement(View, { style: S.c7 }, React.createElement(Text, { style: [S.th, S.right] }, 'SGST')),
        React.createElement(View, { style: S.c8 }, React.createElement(Text, { style: [S.th, S.right] }, 'Total'))
      ),
      // Rows
      ...rows.map((row, i) =>
        React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
          React.createElement(View, { style: S.c0 }, React.createElement(Text, { style: { color: MUTED } }, String(i + 1))),
          React.createElement(View, { style: S.c1 }, React.createElement(Text, { style: S.bold }, row.invoice_number)),
          React.createElement(View, { style: S.c2 }, React.createElement(Text, {}, new Date(row.invoice_date).toLocaleDateString('en-IN'))),
          React.createElement(View, { style: S.c3 }, React.createElement(Text, {}, row.customer_name)),
          React.createElement(View, { style: S.c4 }, React.createElement(Text, { style: { color: MUTED, fontSize: 8 } }, row.gstin || '—')),
          React.createElement(View, { style: S.c5 }, React.createElement(Text, { style: S.right }, fmtInr(row.subtotal))),
          React.createElement(View, { style: S.c6 }, React.createElement(Text, { style: S.right }, fmtInr(row.total_cgst))),
          React.createElement(View, { style: S.c7 }, React.createElement(Text, { style: S.right }, fmtInr(row.total_sgst))),
          React.createElement(View, { style: S.c8 }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(row.grand_total)))
        )
      ),
      // Footer row
      React.createElement(View, { style: S.tfoot },
        React.createElement(View, { style: S.c0 }),
        React.createElement(View, { style: [S.c1, { flex: 1 }] }, React.createElement(Text, { style: S.bold }, `${rows.length} invoices`)),
        React.createElement(View, { style: S.c3 }),
        React.createElement(View, { style: S.c4 }),
        React.createElement(View, { style: S.c5 }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(totals.taxable))),
        React.createElement(View, { style: S.c6 }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(totals.cgst))),
        React.createElement(View, { style: S.c7 }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(totals.sgst))),
        React.createElement(View, { style: S.c8 }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(totals.total)))
      ),
      // Page footer
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
      'Content-Disposition': `attachment; filename="gstr1-${month || 'export'}.pdf"`,
    },
  });
}
