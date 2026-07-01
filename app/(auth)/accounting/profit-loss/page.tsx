import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { getAccountBalances } from '@/lib/accounting';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'Profit & Loss Statement' };

function currentFyRange() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  await requireRole('accountant', 'admin');

  const fy = currentFyRange();
  const from = searchParams.from ?? fy.from;
  const to   = searchParams.to   ?? fy.to;

  const balances = await getAccountBalances({ fromDate: from, toDate: to });

  const income   = balances.filter((a) => a.account_type === 'income');
  const expenses = balances.filter((a) => a.account_type === 'expense');

  const totalIncome   = income.reduce((s, a) => s + a.balance, 0);
  const totalExpenses = expenses.reduce((s, a) => s + a.balance, 0);
  const netProfit     = totalIncome - totalExpenses;

  const pdfUrl = `/api/accounting/profit-loss/pdf?from=${from}&to=${to}`;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Profit &amp; Loss Statement</h1>
        <a href={pdfUrl} className="btn-secondary" download>Export PDF</a>
      </div>

      {/* Date range filter */}
      <form method="GET" className="card mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">From</label>
          <DatePicker name="from" defaultValue={from} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">To</label>
          <DatePicker name="to" defaultValue={to} />
        </div>
        <button
          type="submit"
          className="rounded-full bg-purple-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 transition-colors"
        >
          Apply
        </button>
        <a
          href="/accounting/profit-loss"
          className="rounded-full border border-purple-600 px-5 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50 transition-colors"
        >
          Current FY
        </a>
      </form>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-2xl bg-gradient-to-br from-green-50 to-white p-4 shadow-sm ring-1 ring-green-100">
          <div className="mb-2 text-lg">📈</div>
          <p className="text-xs text-green-600 font-medium">Total Income</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{formatInr(totalIncome)}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-red-50 to-white p-4 shadow-sm ring-1 ring-red-100">
          <div className="mb-2 text-lg">📉</div>
          <p className="text-xs text-red-600 font-medium">Total Expenses</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{formatInr(totalExpenses)}</p>
        </div>
        <div className={`rounded-2xl bg-gradient-to-br p-4 shadow-sm ring-1 ${netProfit >= 0 ? 'from-blue-50 to-white ring-blue-100' : 'from-orange-50 to-white ring-orange-100'}`}>
          <div className="mb-2 text-lg">{netProfit >= 0 ? '💰' : '⚠️'}</div>
          <p className={`text-xs font-medium ${netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
            {netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
          </p>
          <p className={`text-2xl font-bold mt-1 ${netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            {formatInr(Math.abs(netProfit))}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Income */}
        <div className="card p-0 overflow-hidden">
          <div className="bg-green-50 border-b border-green-200 px-4 py-3">
            <h2 className="font-semibold text-green-800">Income</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Account</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {income.filter((a) => a.balance !== 0).map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{a.account_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-700">{formatInr(a.balance)}</td>
                </tr>
              ))}
              {income.filter((a) => a.balance !== 0).length === 0 && (
                <tr><td colSpan={2} className="px-4 py-6 text-center text-sm text-gray-400">No income in period</td></tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-green-50">
              <tr className="font-bold">
                <td className="px-4 py-3 text-green-800">Total Income</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-800">{formatInr(totalIncome)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Expenses */}
        <div className="card p-0 overflow-hidden">
          <div className="bg-red-50 border-b border-red-200 px-4 py-3">
            <h2 className="font-semibold text-red-800">Expenses</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Account</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.filter((a) => a.balance !== 0).map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{a.account_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-700">{formatInr(a.balance)}</td>
                </tr>
              ))}
              {expenses.filter((a) => a.balance !== 0).length === 0 && (
                <tr><td colSpan={2} className="px-4 py-6 text-center text-sm text-gray-400">No expenses in period</td></tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-red-50">
              <tr className="font-bold">
                <td className="px-4 py-3 text-red-800">Total Expenses</td>
                <td className="px-4 py-3 text-right tabular-nums text-red-800">{formatInr(totalExpenses)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Net result */}
      <div className={`mt-6 rounded-xl border-2 p-5 ${netProfit >= 0 ? 'border-blue-300 bg-blue-50' : 'border-orange-300 bg-orange-50'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-lg font-bold ${netProfit >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>
            {netProfit >= 0 ? 'Net Profit' : 'Net Loss'} for period
          </span>
          <span className={`text-2xl font-bold ${netProfit >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>
            {formatInr(Math.abs(netProfit))}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          From {new Date(from).toLocaleDateString('en-IN')} to {new Date(to).toLocaleDateString('en-IN')}
        </p>
      </div>
    </div>
  );
}
