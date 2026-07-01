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
  th:         { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  thead:      { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE, backgroundColor: '#F9FAFB' },
  trow:       { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  trowAlt:    { backgroundColor: '#F9FAFB' },
  bold:       { fontFamily: 'Helvetica-Bold' },
  right:      { textAlign: 'right' },
  footer:     { position: 'absolute', bottom: 20, left: 35, right: 35, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
  footerText: { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  cRank:      { width: 28 },
  cItem:      { flex: 1 },
  cQty:       { width: 60, textAlign: 'right' },
  cRevenue:   { width: 85, textAlign: 'right' },
  cGst:       { width: 75, textAlign: 'right' },
  cInv:       { width: 55, textAlign: 'right' },
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
  const sort  = searchParams.get('sort') === 'revenue' ? 'revenue' : 'qty';

  const conditions = [`i.invoice_date BETWEEN $1 AND $2`, `i.status NOT IN ('cancelled','draft')`];
  const params: unknown[] = [from, to];
  if (searchParams.get('warehouse_id')) { params.push(searchParams.get('warehouse_id')); conditions.push(`i.warehouse_id=$${params.length}`); }
  const where = conditions.join(' AND ');

  const res = await query(
    `SELECT it.name AS item_name, it.item_type,
            SUM(ii.quantity)::numeric AS total_qty,
            SUM(ii.total_amount) AS total_revenue,
            SUM(ii.cgst_amount+ii.sgst_amount) AS total_gst,
            COUNT(DISTINCT i.id)::int AS invoice_count
     FROM invoice_items ii
     JOIN invoices i ON i.id=ii.invoice_id
     JOIN items it ON it.id=ii.item_id
     WHERE ${where}
     GROUP BY it.id, it.name, it.item_type
     ORDER BY ${sort === 'revenue' ? 'total_revenue' : 'total_qty'} DESC
     LIMIT 50`,
    params
  );

  const rows = res.rows as Array<{
    item_name: string; item_type: string;
    total_qty: string; total_revenue: string; total_gst: string; invoice_count: number;
  }>;

  const period = `${new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', style: S.page },
      React.createElement(Text, { style: S.heading }, 'Sutra Collections — Best Sellers'),
      React.createElement(Text, { style: S.subheading }, `Period: ${period}  |  Sorted by: ${sort === 'revenue' ? 'Revenue' : 'Qty Sold'}  |  Top ${rows.length} items`),
      React.createElement(View, { style: S.rule }),

      React.createElement(View, { style: S.thead },
        React.createElement(View, { style: S.cRank }, React.createElement(Text, { style: S.th }, '#')),
        React.createElement(View, { style: S.cItem }, React.createElement(Text, { style: S.th }, 'Item')),
        React.createElement(View, { style: S.cQty }, React.createElement(Text, { style: [S.th, S.right] }, 'Qty')),
        React.createElement(View, { style: S.cRevenue }, React.createElement(Text, { style: [S.th, S.right] }, 'Revenue')),
        React.createElement(View, { style: S.cGst }, React.createElement(Text, { style: [S.th, S.right] }, 'GST')),
        React.createElement(View, { style: S.cInv }, React.createElement(Text, { style: [S.th, S.right] }, 'Invoices'))
      ),

      ...rows.map((row, i) =>
        React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
          React.createElement(View, { style: S.cRank }, React.createElement(Text, { style: { color: MUTED } }, String(i + 1))),
          React.createElement(View, { style: S.cItem }, React.createElement(Text, { style: S.bold }, row.item_name)),
          React.createElement(View, { style: S.cQty }, React.createElement(Text, { style: S.right }, parseFloat(row.total_qty).toFixed(2))),
          React.createElement(View, { style: S.cRevenue }, React.createElement(Text, { style: [S.right, S.bold, { color: PURPLE }] }, fmtInr(Number(row.total_revenue)))),
          React.createElement(View, { style: S.cGst }, React.createElement(Text, { style: [S.right, { color: MUTED }] }, fmtInr(Number(row.total_gst)))),
          React.createElement(View, { style: S.cInv }, React.createElement(Text, { style: S.right }, String(row.invoice_count)))
        )
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
      'Content-Disposition': `attachment; filename="best-sellers-${from}-${to}.pdf"`,
    },
  });
}
