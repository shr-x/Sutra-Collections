import React from 'react';
import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const PURPLE = '#7C3AED';
const DARK   = '#111827';
const MUTED  = '#6B7280';
const RULE   = '#E5E7EB';
const BLUE   = '#1D4ED8';

const S = StyleSheet.create({
  page:       { fontSize: 9, fontFamily: 'Helvetica', color: DARK, backgroundColor: '#FFF', padding: 35 },
  heading:    { fontSize: 15, fontFamily: 'Helvetica-Bold', color: PURPLE, marginBottom: 4 },
  subheading: { fontSize: 9, color: MUTED, marginBottom: 14 },
  rule:       { borderBottomWidth: 1, borderBottomColor: PURPLE, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryBox: { flex: 1, padding: 8, borderWidth: 0.5, borderColor: RULE, borderRadius: 4 },
  summaryLbl: { fontSize: 7, color: MUTED, marginBottom: 2 },
  summaryVal: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: PURPLE },
  th:         { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  thead:      { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE, backgroundColor: '#F9FAFB' },
  trow:       { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  trowAlt:    { backgroundColor: '#F9FAFB' },
  tfoot:      { flexDirection: 'row', paddingVertical: 5, borderTopWidth: 1.5, borderTopColor: RULE, backgroundColor: '#F3F4F6' },
  bold:       { fontFamily: 'Helvetica-Bold' },
  right:      { textAlign: 'right' },
  footer:     { position: 'absolute', bottom: 20, left: 35, right: 35, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
  footerText: { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  cSupplier:  { flex: 1 },
  cCount:     { width: 55, textAlign: 'right' },
  cTotal:     { width: 90, textAlign: 'right' },
  cItc:       { width: 85, textAlign: 'right' },
});

// Use Rs. prefix — Helvetica does not contain the Rs. glyph
function fmtInr(n: number) {
  return `Rs.${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
}

export async function GET(req: NextRequest) {
  await requireRole('admin', 'accountant');

  const { searchParams } = req.nextUrl;
  const today = new Date().toISOString().slice(0, 10);
  const from  = searchParams.get('from') ?? today.slice(0, 7) + '-01';
  const to    = searchParams.get('to')   ?? today;

  const conditions = [`p.purchase_date BETWEEN $1 AND $2`];
  const params: unknown[] = [from, to];
  if (searchParams.get('supplier_id')) { params.push(searchParams.get('supplier_id')); conditions.push(`p.supplier_id=$${params.length}`); }
  const where = conditions.join(' AND ');

  const [summaryRes, bySupplierRes] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS invoice_count,
              COALESCE(SUM(p.grand_total),0) AS total_purchases,
              COALESCE(SUM(p.total_cgst+p.total_sgst),0) AS total_itc,
              COALESCE(SUM(p.amount_paid),0) AS total_paid
       FROM purchase_invoices p WHERE ${where}`, params
    ),
    query(
      `SELECT s.name AS supplier_name, COUNT(p.id)::int AS invoice_count,
              SUM(p.grand_total) AS total, SUM(p.total_cgst+p.total_sgst) AS itc
       FROM purchase_invoices p LEFT JOIN suppliers s ON s.id=p.supplier_id
       WHERE ${where} GROUP BY s.id, s.name ORDER BY total DESC`, params
    ),
  ]);

  const s = summaryRes.rows[0];
  const bySupplier = bySupplierRes.rows as Array<{ supplier_name: string | null; invoice_count: number; total: string; itc: string }>;
  const grandTotal = bySupplier.reduce((acc, r) => acc + Number(r.total), 0);

  const period = `${new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', style: S.page },
      React.createElement(Text, { style: S.heading }, 'Sutra Collections — Purchase Report'),
      React.createElement(Text, { style: S.subheading }, `Period: ${period}`),
      React.createElement(View, { style: S.rule }),

      // Summary
      React.createElement(View, { style: S.summaryRow },
        React.createElement(View, { style: S.summaryBox },
          React.createElement(Text, { style: S.summaryLbl }, 'Total Purchases'),
          React.createElement(Text, { style: S.summaryVal }, fmtInr(Number(s.total_purchases)))
        ),
        React.createElement(View, { style: S.summaryBox },
          React.createElement(Text, { style: S.summaryLbl }, 'ITC Claimable'),
          React.createElement(Text, { style: [S.summaryVal, { color: BLUE }] }, fmtInr(Number(s.total_itc)))
        ),
        React.createElement(View, { style: S.summaryBox },
          React.createElement(Text, { style: S.summaryLbl }, 'Total Paid'),
          React.createElement(Text, { style: S.summaryVal }, fmtInr(Number(s.total_paid)))
        ),
        React.createElement(View, { style: S.summaryBox },
          React.createElement(Text, { style: S.summaryLbl }, 'Invoices'),
          React.createElement(Text, { style: S.summaryVal }, String(Number(s.invoice_count)))
        )
      ),

      // By supplier
      React.createElement(View, { style: S.thead },
        React.createElement(View, { style: S.cSupplier }, React.createElement(Text, { style: S.th }, 'Supplier')),
        React.createElement(View, { style: S.cCount }, React.createElement(Text, { style: [S.th, S.right] }, 'Invoices')),
        React.createElement(View, { style: S.cTotal }, React.createElement(Text, { style: [S.th, S.right] }, 'Total')),
        React.createElement(View, { style: S.cItc }, React.createElement(Text, { style: [S.th, S.right] }, 'ITC'))
      ),

      ...bySupplier.map((row, i) =>
        React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
          React.createElement(View, { style: S.cSupplier }, React.createElement(Text, { style: S.bold }, row.supplier_name ?? '—')),
          React.createElement(View, { style: S.cCount }, React.createElement(Text, { style: S.right }, String(row.invoice_count))),
          React.createElement(View, { style: S.cTotal }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(Number(row.total)))),
          React.createElement(View, { style: S.cItc }, React.createElement(Text, { style: [S.right, { color: BLUE }] }, fmtInr(Number(row.itc))))
        )
      ),

      React.createElement(View, { style: S.tfoot },
        React.createElement(View, { style: S.cSupplier }, React.createElement(Text, { style: S.bold }, `${bySupplier.length} supplier(s)`)),
        React.createElement(View, { style: S.cCount }, React.createElement(Text, { style: [S.right, S.bold] }, String(Number(s.invoice_count)))),
        React.createElement(View, { style: S.cTotal }, React.createElement(Text, { style: [S.right, S.bold, { color: PURPLE }] }, fmtInr(grandTotal))),
        React.createElement(View, { style: S.cItc }, React.createElement(Text, { style: [S.right, S.bold, { color: BLUE }] }, fmtInr(Number(s.total_itc))))
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
      'Content-Disposition': `attachment; filename="purchases-${from}-${to}.pdf"`,
    },
  });
}
