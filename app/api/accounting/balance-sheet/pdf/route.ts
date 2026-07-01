import React from 'react';
import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getAccountBalances } from '@/lib/accounting';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { pool } from '@/lib/db';

const PURPLE = '#7C3AED';
const DARK   = '#111827';
const MUTED  = '#6B7280';
const RULE   = '#E5E7EB';
const BLUE   = '#1D4ED8';
const RED    = '#B91C1C';
const GREEN  = '#15803D';

const S = StyleSheet.create({
  page:          { fontSize: 9, fontFamily: 'Helvetica', color: DARK, backgroundColor: '#FFF', padding: 35 },
  heading:       { fontSize: 15, fontFamily: 'Helvetica-Bold', color: PURPLE, marginBottom: 4 },
  subheading:    { fontSize: 9, color: MUTED, marginBottom: 14 },
  rule:          { borderBottomWidth: 1, borderBottomColor: PURPLE, marginBottom: 14 },
  sectionTitle:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 },
  thead:         { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: RULE, backgroundColor: '#F9FAFB' },
  trow:          { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  trowAlt:       { backgroundColor: '#F9FAFB' },
  tfoot:         { flexDirection: 'row', paddingVertical: 5, borderTopWidth: 1.5, borderTopColor: RULE, backgroundColor: '#F3F4F6' },
  th:            { fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  bold:          { fontFamily: 'Helvetica-Bold' },
  right:         { textAlign: 'right' },
  grid:          { flexDirection: 'row', gap: 16 },
  col:           { flex: 1 },
  sectionGap:    { marginBottom: 12 },
  balanceBox:    { marginTop: 12, padding: 10, borderWidth: 1.5, borderColor: PURPLE, borderRadius: 4 },
  balanceRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  footer:        { position: 'absolute', bottom: 20, left: 35, right: 35, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
  footerText:    { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  cLabel:        { flex: 1 },
  cAmt:          { width: 90, textAlign: 'right' },
});

// Use Rs. prefix — Helvetica does not contain the Rs. glyph
function fmtInr(n: number) {
  return `Rs.${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
}

function AccountSection({ title, rows, total, color }: {
  title: string; rows: Array<{ account_name: string; balance: number }>;
  total: number; color: string;
}) {
  const filtered = rows.filter((r) => r.balance !== 0);
  return React.createElement(
    View,
    { style: S.sectionGap },
    React.createElement(Text, { style: [S.sectionTitle, { color }] }, title),
    React.createElement(View, { style: S.thead },
      React.createElement(View, { style: S.cLabel }, React.createElement(Text, { style: S.th }, 'Account')),
      React.createElement(View, { style: S.cAmt }, React.createElement(Text, { style: [S.th, S.right] }, 'Balance'))
    ),
    ...filtered.map((r, i) =>
      React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
        React.createElement(View, { style: S.cLabel }, React.createElement(Text, {}, r.account_name)),
        React.createElement(View, { style: S.cAmt }, React.createElement(Text, { style: S.right }, fmtInr(r.balance)))
      )
    ),
    React.createElement(View, { style: S.tfoot },
      React.createElement(View, { style: S.cLabel }, React.createElement(Text, { style: [S.bold, { color }] }, `Total ${title}`)),
      React.createElement(View, { style: S.cAmt }, React.createElement(Text, { style: [S.right, S.bold, { color }] }, fmtInr(total)))
    )
  );
}

export async function GET(req: NextRequest) {
  await requireRole('accountant', 'admin');

  const { searchParams } = req.nextUrl;
  const asOf = searchParams.get('asOf') ?? new Date().toISOString().slice(0, 10);

  const settRes = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('company_name','company_gstin')`
  );
  const cfg = Object.fromEntries(settRes.rows.map((r) => [r.key, r.value]));

  const balances = await getAccountBalances({ toDate: asOf });
  const assets      = balances.filter((a) => a.account_type === 'asset');
  const liabilities = balances.filter((a) => a.account_type === 'liability');
  const equity      = balances.filter((a) => a.account_type === 'equity');
  const income      = balances.filter((a) => a.account_type === 'income');
  const expenses    = balances.filter((a) => a.account_type === 'expense');

  const totalAssets      = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const retainedEarnings = income.reduce((s, a) => s + a.balance, 0) - expenses.reduce((s, a) => s + a.balance, 0);
  const totalEquity      = equity.reduce((s, a) => s + a.balance, 0) + retainedEarnings;
  const totalLE          = totalLiabilities + totalEquity;
  const balanced         = Math.abs(totalAssets - totalLE) < 0.01;

  const equityWithRetained = [
    ...equity,
    { id: 'retained', account_name: 'Retained Earnings (Net P&L)', account_type: 'equity', balance: retainedEarnings, account_code: '' },
  ];

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', style: S.page },
      React.createElement(Text, { style: S.heading }, `${cfg.company_name ?? 'Sutra Collections'} — Balance Sheet`),
      React.createElement(Text, { style: S.subheading }, `As of ${new Date(asOf).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`),
      React.createElement(View, { style: S.rule }),

      React.createElement(View, { style: S.grid },
        // Left: Assets
        React.createElement(View, { style: S.col },
          AccountSection({ title: 'Assets', rows: assets, total: totalAssets, color: BLUE })
        ),
        // Right: Liabilities + Equity
        React.createElement(View, { style: S.col },
          AccountSection({ title: 'Liabilities', rows: liabilities, total: totalLiabilities, color: RED }),
          AccountSection({ title: 'Equity', rows: equityWithRetained, total: totalEquity, color: GREEN })
        )
      ),

      // Balance check
      React.createElement(View, { style: [S.balanceBox, { borderColor: balanced ? GREEN : RED }] },
        React.createElement(View, { style: S.balanceRow },
          React.createElement(Text, { style: [S.bold, { color: balanced ? GREEN : RED }] },
            balanced ? 'Balance Sheet Balances' : 'Balance Sheet Does Not Balance'
          ),
          React.createElement(Text, { style: [S.bold, { color: balanced ? GREEN : RED }] },
            `${fmtInr(totalAssets)} ${balanced ? '=' : '≠'} ${fmtInr(totalLE)}`
          )
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
      'Content-Disposition': `attachment; filename="balance-sheet-${asOf}.pdf"`,
    },
  });
}
