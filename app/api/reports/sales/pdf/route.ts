import React from 'react';
import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
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
  cDate:      { width: 80 },
  cCount:     { width: 55, textAlign: 'right' },
  cTotal:     { flex: 1, textAlign: 'right' },
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

  const conditions = [`i.invoice_date BETWEEN $1 AND $2`, `i.status NOT IN ('cancelled','draft')`];
  const params: unknown[] = [from, to];
  if (searchParams.get('warehouse_id')) { params.push(searchParams.get('warehouse_id')); conditions.push(`i.warehouse_id=$${params.length}`); }
  const where = conditions.join(' AND ');

  const [summaryRes, dailyRes] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS invoice_count, COALESCE(SUM(i.grand_total),0) AS total_sales,
              COALESCE(SUM(i.total_cgst+i.total_sgst),0) AS total_gst
       FROM invoices i WHERE ${where}`, params
    ),
    query(
      `SELECT i.invoice_date::text AS day, COUNT(*)::int AS count, SUM(i.grand_total) AS total
       FROM invoices i WHERE ${where} GROUP BY i.invoice_date ORDER BY i.invoice_date`, params
    ),
  ]);

  const s = summaryRes.rows[0];
  const dailyRows = dailyRes.rows as Array<{ day: string; count: number; total: string }>;
  const grandTotal = dailyRows.reduce((acc, r) => acc + Number(r.total), 0);

  const period = `${new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', style: S.page },
      React.createElement(Text, { style: S.heading }, 'Sutra Collections — Sales Report'),
      React.createElement(Text, { style: S.subheading }, `Period: ${period}`),
      React.createElement(View, { style: S.rule }),

      // Summary
      React.createElement(View, { style: S.summaryRow },
        React.createElement(View, { style: S.summaryBox },
          React.createElement(Text, { style: S.summaryLbl }, 'Total Sales'),
          React.createElement(Text, { style: S.summaryVal }, fmtInr(Number(s.total_sales)))
        ),
        React.createElement(View, { style: S.summaryBox },
          React.createElement(Text, { style: S.summaryLbl }, 'GST Collected'),
          React.createElement(Text, { style: S.summaryVal }, fmtInr(Number(s.total_gst)))
        ),
        React.createElement(View, { style: S.summaryBox },
          React.createElement(Text, { style: S.summaryLbl }, 'Total Invoices'),
          React.createElement(Text, { style: S.summaryVal }, String(Number(s.invoice_count)))
        )
      ),

      // Daily table header
      React.createElement(View, { style: S.thead },
        React.createElement(View, { style: S.cDate }, React.createElement(Text, { style: S.th }, 'Date')),
        React.createElement(View, { style: S.cCount }, React.createElement(Text, { style: [S.th, S.right] }, 'Invoices')),
        React.createElement(View, { style: S.cTotal }, React.createElement(Text, { style: [S.th, S.right] }, 'Total Sales'))
      ),

      ...dailyRows.map((row, i) =>
        React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
          React.createElement(View, { style: S.cDate }, React.createElement(Text, {}, new Date(row.day + 'T00:00:00').toLocaleDateString('en-IN', { dateStyle: 'medium' }))),
          React.createElement(View, { style: S.cCount }, React.createElement(Text, { style: S.right }, String(row.count))),
          React.createElement(View, { style: S.cTotal }, React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(Number(row.total))))
        )
      ),

      React.createElement(View, { style: S.tfoot },
        React.createElement(View, { style: S.cDate }, React.createElement(Text, { style: S.bold }, `${dailyRows.length} days`)),
        React.createElement(View, { style: S.cCount }, React.createElement(Text, { style: [S.right, S.bold] }, String(Number(s.invoice_count)))),
        React.createElement(View, { style: S.cTotal }, React.createElement(Text, { style: [S.right, S.bold, { color: PURPLE }] }, fmtInr(grandTotal)))
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
      'Content-Disposition': `attachment; filename="sales-report-${from}-${to}.pdf"`,
    },
  });
}
