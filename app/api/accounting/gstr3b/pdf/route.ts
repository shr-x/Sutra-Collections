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
  rule:       { borderBottomWidth: 1, borderBottomColor: PURPLE, marginBottom: 14 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 6, marginTop: 10 },
  thead:      { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE, backgroundColor: '#F9FAFB' },
  trow:       { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: RULE },
  trowAlt:    { backgroundColor: '#F9FAFB' },
  tfoot:      { flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1.5, borderTopColor: RULE, backgroundColor: '#EDE9FE' },
  th:         { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  bold:       { fontFamily: 'Helvetica-Bold' },
  right:      { textAlign: 'right' },
  netBox:     { marginTop: 14, padding: 10, borderWidth: 1, borderColor: PURPLE, borderRadius: 4 },
  netLabel:   { fontSize: 10, fontFamily: 'Helvetica-Bold', color: PURPLE, marginBottom: 6 },
  netRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  netKey:     { fontSize: 9, color: MUTED },
  netVal:     { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK },
  footer:     { position: 'absolute', bottom: 20, left: 35, right: 35, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
  footerText: { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  cDesc:      { flex: 1 },
  cAmt:       { width: 90, textAlign: 'right' },
});

// Use Rs. prefix — Helvetica does not contain the Rs. glyph
function fmtInr(n: number) {
  return `Rs.${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
}

function TableSection({ title, rows }: { title: string; rows: Array<[string, number, number]> }) {
  return React.createElement(
    View,
    {},
    React.createElement(Text, { style: S.sectionTitle }, title),
    React.createElement(View, { style: S.thead },
      React.createElement(View, { style: S.cDesc }, React.createElement(Text, { style: S.th }, 'Description')),
      React.createElement(View, { style: { width: 90 } }, React.createElement(Text, { style: [S.th, S.right] }, 'CGST')),
      React.createElement(View, { style: { width: 90 } }, React.createElement(Text, { style: [S.th, S.right] }, 'SGST'))
    ),
    ...rows.map(([label, cgst, sgst], i) =>
      React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
        React.createElement(View, { style: S.cDesc }, React.createElement(Text, {}, label)),
        React.createElement(View, { style: { width: 90 } }, React.createElement(Text, { style: S.right }, fmtInr(cgst))),
        React.createElement(View, { style: { width: 90 } }, React.createElement(Text, { style: S.right }, fmtInr(sgst)))
      )
    )
  );
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

  const [salesRes, cnRes, itcRes, dnItcRes] = await Promise.all([
    pool.query<{ total_taxable: string; total_cgst: string; total_sgst: string; total_grand: string }>(
      `SELECT COALESCE(SUM(subtotal),0) AS total_taxable, COALESCE(SUM(total_cgst),0) AS total_cgst,
              COALESCE(SUM(total_sgst),0) AS total_sgst, COALESCE(SUM(grand_total),0) AS total_grand
       FROM invoices WHERE status NOT IN ('cancelled','draft') AND invoice_date BETWEEN $1 AND $2`,
      [from, to]
    ),
    pool.query<{ total_taxable: string; total_cgst: string; total_sgst: string }>(
      `SELECT COALESCE(SUM(subtotal),0) AS total_taxable, COALESCE(SUM(total_cgst),0) AS total_cgst,
              COALESCE(SUM(total_sgst),0) AS total_sgst
       FROM credit_notes WHERE status IN ('issued','settled') AND created_at::date BETWEEN $1 AND $2`,
      [from, to]
    ),
    pool.query<{ total_cgst: string; total_sgst: string }>(
      `SELECT COALESCE(SUM(total_cgst),0) AS total_cgst, COALESCE(SUM(total_sgst),0) AS total_sgst
       FROM purchase_invoices WHERE include_in_gst=TRUE AND status NOT IN ('cancelled') AND purchase_date BETWEEN $1 AND $2`,
      [from, to]
    ),
    pool.query<{ total_cgst: string; total_sgst: string }>(
      `SELECT COALESCE(SUM(total_cgst),0) AS total_cgst, COALESCE(SUM(total_sgst),0) AS total_sgst
       FROM debit_notes WHERE reduces_itc=TRUE AND status='issued' AND created_at::date BETWEEN $1 AND $2`,
      [from, to]
    ),
  ]);

  const s = salesRes.rows[0];
  const cn = cnRes.rows[0];
  const itc = itcRes.rows[0];
  const dn = dnItcRes.rows[0];

  const outCgst = Number(s.total_cgst)   - Number(cn.total_cgst);
  const outSgst = Number(s.total_sgst)   - Number(cn.total_sgst);
  const itcCgst = Math.max(0, Number(itc.total_cgst) - Number(dn.total_cgst));
  const itcSgst = Math.max(0, Number(itc.total_sgst) - Number(dn.total_sgst));
  const netCgst = outCgst - itcCgst;
  const netSgst = outSgst - itcSgst;

  const period = `${new Date(from).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', style: S.page },
      React.createElement(Text, { style: S.heading }, `${cfg.company_name ?? 'Sutra Collections'} — GSTR-3B Tax Summary`),
      React.createElement(Text, { style: S.subheading }, `GSTIN: ${cfg.company_gstin ?? '—'}  |  Period: ${period}`),
      React.createElement(View, { style: S.rule }),

      // 3.1 Outward supplies
      TableSection({ title: '3.1 — Outward Supplies (Sales)', rows: [
        ['Taxable Outward Supplies', Number(s.total_cgst), Number(s.total_sgst)],
        ['Less: Credit Notes', -Number(cn.total_cgst), -Number(cn.total_sgst)],
        ['Net Outward (A)', outCgst, outSgst],
      ]}),

      // ITC
      TableSection({ title: '4 — Input Tax Credit (ITC)', rows: [
        ['ITC Available (Purchases with GST)', Number(itc.total_cgst), Number(itc.total_sgst)],
        ['Less: Debit Note Reversals', -Number(dn.total_cgst), -Number(dn.total_sgst)],
        ['Net ITC (B)', itcCgst, itcSgst],
      ]}),

      // Net tax payable
      React.createElement(View, { style: S.netBox },
        React.createElement(Text, { style: S.netLabel }, '5 — Net Tax Payable (A − B)'),
        React.createElement(View, { style: S.netRow },
          React.createElement(Text, { style: S.netKey }, 'CGST Payable'),
          React.createElement(Text, { style: S.netVal }, fmtInr(Math.max(0, netCgst)))
        ),
        React.createElement(View, { style: S.netRow },
          React.createElement(Text, { style: S.netKey }, 'SGST Payable'),
          React.createElement(Text, { style: S.netVal }, fmtInr(Math.max(0, netSgst)))
        ),
        React.createElement(View, { style: S.netRow },
          React.createElement(Text, { style: [S.netKey, { color: PURPLE }] }, 'Total Tax Payable'),
          React.createElement(Text, { style: [S.netVal, { color: PURPLE, fontSize: 12 }] }, fmtInr(Math.max(0, netCgst + netSgst)))
        )
      ),

      React.createElement(View, { style: S.footer },
        React.createElement(Text, { style: S.footerText }, `Generated on ${new Date().toLocaleString('en-IN')} — Summary only. File GSTR-3B on GST Portal.`)
      )
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await (renderToBuffer as any)(doc) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="gstr3b-${month || 'export'}.pdf"`,
    },
  });
}
