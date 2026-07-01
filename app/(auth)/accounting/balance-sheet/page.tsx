import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { getAccountBalances } from '@/lib/accounting';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'Balance Sheet' };

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: { asOf?: string };
}) {
  await requireRole('accountant', 'admin');

  const asOf = searchParams.asOf ?? new Date().toISOString().slice(0, 10);
  const balances = await getAccountBalances({ toDate: asOf });

  const assets      = balances.filter((a) => a.account_type === 'asset');
  const liabilities = balances.filter((a) => a.account_type === 'liability');
  const equity      = balances.filter((a) => a.account_type === 'equity');
  const income      = balances.filter((a) => a.account_type === 'income');
  const expenses    = balances.filter((a) => a.account_type === 'expense');

  const totalAssets      = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const retainedEarnings = income.reduce((s, a) => s + a.balance, 0)
                         - expenses.reduce((s, a) => s + a.balance, 0);
  const totalEquity      = equity.reduce((s, a) => s + a.balance, 0) + retainedEarnings;
  const totalLE          = totalLiabilities + totalEquity;
  const balanced         = Math.abs(totalAssets - totalLE) < 0.01;

  const Section = ({ title, rows, color }: {
    title: string;
    rows: typeof balances;
    color: string;
  }) => (
    <div className="card p-0 overflow-hidden">
      <div className={`${color} border-b px-4 py-3`}>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100">
          {rows.filter((a) => a.balance !== 0).map((a, idx) => (
            <tr key={a.id} className={`transition-colors hover:bg-purple-50/40 ${idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}>
              <td className="px-4 py-3 text-gray-700">{a.account_name}</td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-800">{formatInr(a.balance)}</td>
            </tr>
          ))}
          {rows.filter((a) => a.balance !== 0).length === 0 && (
            <tr><td colSpan={2} className="px-4 py-6 text-center text-sm text-gray-400">No balances</td></tr>
          )}
        </tbody>
        <tfoot className="border-t-2 border-gray-300 bg-gray-50">
          <tr className="font-bold">
            <td className="px-4 py-3 text-gray-700">Total</td>
            <td className="px-4 py-3 text-right tabular-nums text-gray-900">
              {formatInr(rows.reduce((s, a) => s + a.balance, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const pdfUrl = `/api/accounting/balance-sheet/pdf?asOf=${asOf}`;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Balance Sheet</h1>
        <a href={pdfUrl} className="btn-secondary" download>Export PDF</a>
      </div>

      <form method="GET" className="card mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">As Of Date</label>
          <DatePicker name="asOf" defaultValue={asOf} />
        </div>
        <button
          type="submit"
          className="rounded-full bg-purple-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 transition-colors"
        >
          Apply
        </button>
      </form>

      {!balanced && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Balance Sheet doesn't balance — Assets: {formatInr(totalAssets)} ≠ L+E: {formatInr(totalLE)}
        </div>
      )}

      {/* Summary Bar */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="flex items-center gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-lg shadow-sm">
            🏦
          </div>
          <div>
            <p className="text-xs font-semibold text-blue-600">Total Assets</p>
            <p className="text-xl font-bold text-blue-800 mt-0.5">{formatInr(totalAssets)}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white text-lg shadow-sm">
            💸
          </div>
          <div>
            <p className="text-xs font-semibold text-red-600">Total Liabilities</p>
            <p className="text-xl font-bold text-red-800 mt-0.5">{formatInr(totalLiabilities)}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-600 text-white text-lg shadow-sm">
            📊
          </div>
          <div>
            <p className="text-xs font-semibold text-green-600">Total Equity (incl. retained)</p>
            <p className="text-xl font-bold text-green-800 mt-0.5">{formatInr(totalEquity)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Assets */}
        <Section title="Assets" rows={assets} color="bg-blue-50 text-blue-800" />

        {/* Right: Liabilities + Equity */}
        <div className="space-y-4">
          <Section title="Liabilities" rows={liabilities} color="bg-red-50 text-red-800" />

          <div className="card p-0 overflow-hidden">
            <div className="bg-green-50 border-b border-green-200 px-4 py-3">
              <h2 className="font-semibold text-green-800">Equity</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {equity.filter((a) => a.balance !== 0).map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{a.account_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-800">{formatInr(a.balance)}</td>
                  </tr>
                ))}
                <tr className="hover:bg-gray-50 italic">
                  <td className="px-4 py-3 text-gray-700">Retained Earnings (Net P&L)</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${retainedEarnings < 0 ? 'text-red-700' : 'text-gray-800'}`}>
                    {formatInr(retainedEarnings)}
                  </td>
                </tr>
              </tbody>
              <tfoot className="border-t-2 border-gray-300 bg-green-50">
                <tr className="font-bold">
                  <td className="px-4 py-3 text-green-800">Total Equity</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-800">{formatInr(totalEquity)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className={`mt-6 rounded-xl border-2 p-5 ${
        balanced
          ? 'border-green-300 bg-gradient-to-r from-green-50 to-emerald-50'
          : 'border-red-300 bg-red-50'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{balanced ? '✅' : '⚠️'}</span>
            <span className={`font-bold ${balanced ? 'text-green-800' : 'text-red-800'}`}>
              {balanced ? 'Balance Sheet Balances' : 'Balance Sheet Does Not Balance'}
            </span>
          </div>
          <span className={`font-bold tabular-nums ${balanced ? 'text-green-700' : 'text-red-700'}`}>
            {formatInr(totalAssets)} {balanced ? '=' : '≠'} {formatInr(totalLE)}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500 ml-8">
          Assets = Liabilities + Equity &nbsp;·&nbsp; As of {new Date(asOf).toLocaleDateString('en-IN')}
        </p>
      </div>
    </div>
  );
}
