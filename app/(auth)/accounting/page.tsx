import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { getAccountBalances } from '@/lib/accounting';
import { formatInr } from '@/lib/gst';

export const metadata: Metadata = { title: 'Accounting' };

export default async function AccountingPage() {
  await requireRole('accountant', 'admin');

  const balances = await getAccountBalances();

  const cash     = balances.find((a) => a.account_code === '1001')?.balance ?? 0;
  const bank     = balances.find((a) => a.account_code === '1002')?.balance ?? 0;
  const ar       = balances.find((a) => a.account_code === '1100')?.balance ?? 0;
  const ap       = balances.find((a) => a.account_code === '2001')?.balance ?? 0;
  const revenue  = balances.find((a) => a.account_code === '4001')?.balance ?? 0;
  const expenses = balances
    .filter((a) => a.account_type === 'expense')
    .reduce((s, a) => s + a.balance, 0);

  const cards = [
    { label: 'Cash on Hand',   value: formatInr(cash),    color: 'green',  icon: '👛' },
    { label: 'Bank Balance',   value: formatInr(bank),    color: 'blue',   icon: '🏦' },
    { label: 'Receivables (AR)', value: formatInr(ar),    color: 'yellow', icon: '📥' },
    { label: 'Payables (AP)',  value: formatInr(ap),      color: 'red',    icon: '📤' },
    { label: 'Total Revenue',  value: formatInr(revenue), color: 'purple', icon: '📊' },
    { label: 'Total Expenses', value: formatInr(expenses),color: 'orange', icon: '💸' },
    { label: 'Net Profit',     value: formatInr(revenue - expenses), color: revenue > expenses ? 'green' : 'red', icon: '📈' },
  ];

  const colorMap: Record<string, string> = {
    green:  'from-green-50  to-white text-green-700  ring-green-100',
    blue:   'from-blue-50   to-white text-blue-700   ring-blue-100',
    yellow: 'from-yellow-50 to-white text-yellow-700 ring-yellow-100',
    red:    'from-red-50    to-white text-red-700    ring-red-100',
    purple: 'from-purple-50 to-white text-purple-700 ring-purple-100',
    orange: 'from-orange-50 to-white text-orange-700 ring-orange-100',
  };

  const quickLinks = [
    { href: '/accounting/journal',       label: 'Journal',       icon: '📋', desc: 'All entries & postings' },
    { href: '/accounting/ledger',        label: 'Ledger',        icon: '📖', desc: 'Account-wise transactions' },
    { href: '/accounting/trial-balance', label: 'Trial Balance', icon: '⚖️', desc: 'Debits vs credits' },
    { href: '/accounting/profit-loss',   label: 'P&L Statement', icon: '📈', desc: 'Income & expenses' },
    { href: '/accounting/balance-sheet', label: 'Balance Sheet', icon: '🏛️', desc: 'Assets, liabilities, equity' },
    { href: '/accounting/expenses',      label: 'Expenses',      icon: '💸', desc: 'Record & track spend' },
    { href: '/accounting/gst/gstr1',     label: 'GSTR-1',        icon: '🧾', desc: 'Outward supplies' },
    { href: '/accounting/gst/gstr3b',    label: 'GSTR-3B',       icon: '🧾', desc: 'Summary return' },
    { href: '/accounting/gst/hsn',       label: 'HSN Summary',   icon: '📊', desc: 'HSN-wise tax' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Accounting</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl bg-gradient-to-br p-4 shadow-sm ring-1 ${colorMap[c.color]}`}>
            <div className="mb-2 text-lg">{c.icon}</div>
            <p className="text-xs font-medium text-gray-500">{c.label}</p>
            <p className="mt-0.5 text-xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-gray-500 uppercase tracking-wide">Modules</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
            >
              <span className="text-2xl">{l.icon}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{l.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{l.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
