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
  bold:       { fontFamily: 'Helvetica-Bold' },
  right:      { textAlign: 'right' },
  footer:     { position: 'absolute', bottom: 20, left: 35, right: 35, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
  footerText: { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  cDate:      { width: 70 },
  cDesc:      { flex: 1 },
  cType:      { width: 60 },
  cAmt:       { width: 80, textAlign: 'right' },
});

// Use Rs. prefix — Helvetica does not contain the Rs. glyph
function fmtInr(n: number) {
  return `Rs.${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
}

export async function GET(req: NextRequest) {
  await requireRole('accountant', 'admin');

  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from') ?? '';
  const to   = searchParams.get('to')   ?? '';

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (from) { params.push(from); conditions.push(`je.entry_date >= $${params.length}`); }
  if (to)   { params.push(to);   conditions.push(`je.entry_date <= $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await pool.query(
    `SELECT je.id, je.entry_date, je.description, je.reference_type, je.is_manual,
            COALESCE(SUM(jl.debit_amount), 0) AS total_debit
     FROM journal_entries je
     LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
     ${where}
     GROUP BY je.id
     ORDER BY je.entry_date DESC, je.created_at DESC
     LIMIT 500`,
    params
  );

  const rows = res.rows.map((r) => ({
    ...r,
    total_debit: Number(r.total_debit),
    entry_date: new Date(r.entry_date).toLocaleDateString('en-IN'),
    type_label: r.is_manual ? 'Manual' : (r.reference_type?.replace('_', ' ') ?? 'Auto'),
  }));

  const period = from && to
    ? `${new Date(from).toLocaleDateString('en-IN', { dateStyle: 'medium' })} – ${new Date(to).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`
    : 'All time';

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', style: S.page },
      React.createElement(Text, { style: S.heading }, 'Sutra Collections — Journal Entries'),
      React.createElement(Text, { style: S.subheading }, `Period: ${period}  |  ${rows.length} entries`),
      React.createElement(View, { style: S.rule }),

      // Table header
      React.createElement(View, { style: S.thead },
        React.createElement(View, { style: S.cDate }, React.createElement(Text, { style: S.th }, 'Date')),
        React.createElement(View, { style: S.cDesc }, React.createElement(Text, { style: S.th }, 'Description')),
        React.createElement(View, { style: S.cType }, React.createElement(Text, { style: S.th }, 'Type')),
        React.createElement(View, { style: S.cAmt },  React.createElement(Text, { style: [S.th, S.right] }, 'Amount'))
      ),

      ...rows.map((row, i) =>
        React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
          React.createElement(View, { style: S.cDate }, React.createElement(Text, { style: { color: MUTED } }, row.entry_date)),
          React.createElement(View, { style: S.cDesc }, React.createElement(Text, { style: S.bold }, row.description)),
          React.createElement(View, { style: S.cType }, React.createElement(Text, { style: { color: MUTED, fontSize: 8 } }, row.type_label)),
          React.createElement(View, { style: S.cAmt },  React.createElement(Text, { style: [S.right, S.bold] }, fmtInr(row.total_debit)))
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
      'Content-Disposition': 'attachment; filename="journal.pdf"',
    },
  });
}
