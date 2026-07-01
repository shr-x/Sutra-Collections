import React from 'react';
import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const PURPLE = '#7C3AED';
const DARK   = '#111827';
const MUTED  = '#6B7280';
const RULE   = '#E5E7EB';
const GREEN  = '#15803D';
const RED    = '#B91C1C';

const S = StyleSheet.create({
  page:       { fontSize: 9, fontFamily: 'Helvetica', color: DARK, backgroundColor: '#FFF', padding: 35 },
  heading:    { fontSize: 15, fontFamily: 'Helvetica-Bold', color: PURPLE, marginBottom: 4 },
  subheading: { fontSize: 9, color: MUTED, marginBottom: 14 },
  rule:       { borderBottomWidth: 1, borderBottomColor: PURPLE, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  summaryBox: { flex: 1, padding: 8, borderWidth: 0.5, borderColor: RULE, borderRadius: 4 },
  summaryLbl: { fontSize: 7, color: MUTED, marginBottom: 2 },
  summaryVal: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  th:         { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  thead:      { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE, backgroundColor: '#F9FAFB' },
  trow:       { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  trowAlt:    { backgroundColor: '#F9FAFB' },
  bold:       { fontFamily: 'Helvetica-Bold' },
  right:      { textAlign: 'right' },
  footer:     { position: 'absolute', bottom: 20, left: 35, right: 35, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
  footerText: { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  c0: { width: 45 },
  c1: { width: 55 },
  c2: { width: 65 },
  c3: { flex: 1 },
  c4: { width: 60 },
  c5: { width: 55 },
  c6: { width: 65, textAlign: 'right' },
  c7: { width: 65, textAlign: 'right' },
});

// Use Rs. prefix — Helvetica does not contain the Rs. glyph
function fmtInr(n: number) {
  return `Rs.${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
}

export async function GET(req: NextRequest) {
  await requireRole('admin', 'accountant');

  const { searchParams } = req.nextUrl;
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  const [salesRes, purchaseRes, expRes] = await Promise.all([
    query(
      `SELECT i.invoice_number AS ref, i.invoice_date,
              COALESCE(c.name,'Walk-in') AS entity,
              i.payment_mode AS mode, i.grand_total AS amount, i.created_at AS time
       FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
       WHERE i.invoice_date=$1 AND i.status <> 'cancelled' ORDER BY i.created_at`,
      [date]
    ),
    query(
      `SELECT p.purchase_number AS ref, p.purchase_date,
              COALESCE(s.name,'—') AS entity,
              p.payment_mode AS mode, p.grand_total AS amount, p.created_at AS time
       FROM purchase_invoices p LEFT JOIN suppliers s ON s.id=p.supplier_id
       WHERE p.purchase_date=$1 ORDER BY p.created_at`,
      [date]
    ),
    query(
      `SELECT NULL::text AS ref, e.expense_date, e.description AS entity,
              e.payment_mode AS mode, e.amount, e.created_at AS time
       FROM expenses e WHERE e.expense_date=$1 ORDER BY e.created_at`,
      [date]
    ),
  ]);

  const rows = [
    ...salesRes.rows.map((r) => ({ time: new Date(r.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), type: 'Sale', ref: r.ref, entity: r.entity, mode: r.mode, amount: Number(r.amount), direction: 'in' as const })),
    ...purchaseRes.rows.map((r) => ({ time: new Date(r.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), type: 'Purchase', ref: r.ref ?? '—', entity: r.entity, mode: r.mode, amount: Number(r.amount), direction: 'out' as const })),
    ...expRes.rows.map((r) => ({ time: new Date(r.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), type: 'Expense', ref: r.ref ?? '—', entity: r.entity, mode: r.mode, amount: Number(r.amount), direction: 'out' as const })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  const totalIn  = rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0);
  const net      = totalIn - totalOut;

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', orientation: 'landscape', style: S.page },
      React.createElement(Text, { style: S.heading }, 'Sutra Collections — Daybook'),
      React.createElement(Text, { style: S.subheading }, `Date: ${new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { dateStyle: 'long' })}  |  ${rows.length} transaction(s)`),
      React.createElement(View, { style: S.rule }),

      // Summary
      React.createElement(View, { style: S.summaryRow },
        React.createElement(View, { style: S.summaryBox },
          React.createElement(Text, { style: S.summaryLbl }, 'Total Sales'),
          React.createElement(Text, { style: [S.summaryVal, { color: GREEN }] }, fmtInr(totalIn))
        ),
        React.createElement(View, { style: S.summaryBox },
          React.createElement(Text, { style: S.summaryLbl }, 'Total Outflow'),
          React.createElement(Text, { style: [S.summaryVal, { color: RED }] }, fmtInr(totalOut))
        ),
        React.createElement(View, { style: S.summaryBox },
          React.createElement(Text, { style: S.summaryLbl }, 'Net for Day'),
          React.createElement(Text, { style: [S.summaryVal, { color: net >= 0 ? PURPLE : RED }] }, fmtInr(net))
        )
      ),

      // Table header
      React.createElement(View, { style: S.thead },
        React.createElement(View, { style: S.c0 }, React.createElement(Text, { style: S.th }, 'Time')),
        React.createElement(View, { style: S.c1 }, React.createElement(Text, { style: S.th }, 'Type')),
        React.createElement(View, { style: S.c2 }, React.createElement(Text, { style: S.th }, 'Reference')),
        React.createElement(View, { style: S.c3 }, React.createElement(Text, { style: S.th }, 'Party')),
        React.createElement(View, { style: S.c4 }, React.createElement(Text, { style: S.th }, 'Mode')),
        React.createElement(View, { style: S.c6 }, React.createElement(Text, { style: [S.th, S.right] }, 'Amount'))
      ),

      ...rows.map((row, i) =>
        React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
          React.createElement(View, { style: S.c0 }, React.createElement(Text, { style: { color: MUTED } }, row.time)),
          React.createElement(View, { style: S.c1 }, React.createElement(Text, { style: { color: row.type === 'Sale' ? GREEN : row.type === 'Purchase' ? '#1D4ED8' : MUTED } }, row.type)),
          React.createElement(View, { style: S.c2 }, React.createElement(Text, { style: { fontSize: 8 } }, row.ref)),
          React.createElement(View, { style: S.c3 }, React.createElement(Text, {}, row.entity)),
          React.createElement(View, { style: S.c4 }, React.createElement(Text, { style: { color: MUTED } }, row.mode ?? '—')),
          React.createElement(View, { style: S.c6 }, React.createElement(Text, { style: [S.right, S.bold, { color: row.direction === 'in' ? GREEN : RED }] },
            `${row.direction === 'out' ? '-' : ''}${fmtInr(row.amount)}`
          ))
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
      'Content-Disposition': `attachment; filename="daybook-${date}.pdf"`,
    },
  });
}
