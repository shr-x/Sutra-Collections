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
const GREEN  = '#15803D';
const RED    = '#B91C1C';

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
  grid:          { flexDirection: 'row', gap: 16, marginBottom: 12 },
  col:           { flex: 1 },
  netBox:        { marginTop: 10, padding: 10, borderWidth: 1.5, borderColor: PURPLE, borderRadius: 4 },
  netLabel:      { fontSize: 11, fontFamily: 'Helvetica-Bold', color: PURPLE, marginBottom: 4 },
  netValue:      { fontSize: 16, fontFamily: 'Helvetica-Bold', color: PURPLE },
  footer:        { position: 'absolute', bottom: 20, left: 35, right: 35, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 4 },
  footerText:    { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  cLabel:        { flex: 1 },
  cAmt:          { width: 90, textAlign: 'right' },
});

// Use Rs. prefix — Helvetica does not contain the Rs. glyph
function fmtInr(n: number) {
  return `Rs.${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
}

function AccountTable({ title, rows, totalLabel, total, color }: {
  title: string; rows: Array<{ account_name: string; balance: number }>;
  totalLabel: string; total: number; color: string;
}) {
  const filtered = rows.filter((r) => r.balance !== 0);
  return React.createElement(
    View,
    {},
    React.createElement(Text, { style: [S.sectionTitle, { color }] }, title),
    React.createElement(View, { style: S.thead },
      React.createElement(View, { style: S.cLabel }, React.createElement(Text, { style: S.th }, 'Account')),
      React.createElement(View, { style: S.cAmt }, React.createElement(Text, { style: [S.th, S.right] }, 'Amount'))
    ),
    ...filtered.map((r, i) =>
      React.createElement(View, { key: i, style: i % 2 === 1 ? [S.trow, S.trowAlt] : S.trow },
        React.createElement(View, { style: S.cLabel }, React.createElement(Text, {}, r.account_name)),
        React.createElement(View, { style: S.cAmt }, React.createElement(Text, { style: S.right }, fmtInr(r.balance)))
      )
    ),
    React.createElement(View, { style: S.tfoot },
      React.createElement(View, { style: S.cLabel }, React.createElement(Text, { style: [S.bold, { color }] }, totalLabel)),
      React.createElement(View, { style: S.cAmt }, React.createElement(Text, { style: [S.right, S.bold, { color }] }, fmtInr(total)))
    )
  );
}

export async function GET(req: NextRequest) {
  await requireRole('accountant', 'admin');

  const { searchParams } = req.nextUrl;
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const from = searchParams.get('from') ?? `${year}-04-01`;
  const to   = searchParams.get('to')   ?? `${year + 1}-03-31`;

  const settRes = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('company_name','company_gstin')`
  );
  const cfg = Object.fromEntries(settRes.rows.map((r) => [r.key, r.value]));

  const balances = await getAccountBalances({ fromDate: from, toDate: to });
  const income   = balances.filter((a) => a.account_type === 'income');
  const expenses = balances.filter((a) => a.account_type === 'expense');
  const totalIncome   = income.reduce((s, a) => s + a.balance, 0);
  const totalExpenses = expenses.reduce((s, a) => s + a.balance, 0);
  const netProfit     = totalIncome - totalExpenses;

  const period = `${new Date(from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const doc = React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: 'A4', style: S.page },
      React.createElement(Text, { style: S.heading }, `${cfg.company_name ?? 'Sutra Collections'} — Profit & Loss Statement`),
      React.createElement(Text, { style: S.subheading }, `Period: ${period}`),
      React.createElement(View, { style: S.rule }),

      React.createElement(View, { style: S.grid },
        // Income
        React.createElement(View, { style: S.col },
          AccountTable({ title: 'Income', rows: income, totalLabel: 'Total Income', total: totalIncome, color: GREEN })
        ),
        // Expenses
        React.createElement(View, { style: S.col },
          AccountTable({ title: 'Expenses', rows: expenses, totalLabel: 'Total Expenses', total: totalExpenses, color: RED })
        )
      ),

      // Net result
      React.createElement(View, { style: S.netBox },
        React.createElement(Text, { style: S.netLabel }, netProfit >= 0 ? 'Net Profit' : 'Net Loss'),
        React.createElement(Text, { style: [S.netValue, { color: netProfit >= 0 ? GREEN : RED }] }, fmtInr(Math.abs(netProfit)))
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
      'Content-Disposition': 'attachment; filename="profit-loss.pdf"',
    },
  });
}
