import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { getAccountBalances } from '@/lib/accounting';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'Trial Balance' };

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  await requireRole('accountant', 'admin');

  const balances = await getAccountBalances({
    fromDate: searchParams.from,
    toDate:   searchParams.to,
  });

  const totalDebit  = balances.reduce((s, a) => s + a.total_debit,  0);
  const totalCredit = balances.reduce((s, a) => s + a.total_credit, 0);
  const diff        = Math.abs(totalDebit - totalCredit);
  const balanced    = diff < 0.01;

  const params = new URLSearchParams();
  if (searchParams.from) params.set('from', searchParams.from);
  if (searchParams.to)   params.set('to',   searchParams.to);
  const csvUrl = `/api/accounting/trial-balance?${params.toString()}`;

  const typeOrder: Record<string, number> = { asset: 1, liability: 2, equity: 3, income: 4, expense: 5 };
  const TYPE_LABELS: Record<string, string> = {
    asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses',
  };
  const sorted = [...balances].sort(
    (a, b) => (typeOrder[a.account_type] ?? 9) - (typeOrder[b.account_type] ?? 9)
  );

  const groups = sorted.reduce<Record<string, typeof sorted>>((acc, r) => {
    (acc[r.account_type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Trial Balance</h1>
        <a href={csvUrl} className="btn-secondary min-h-[44px]">Export CSV</a>
      </div>

      {/* Filters */}
      <form method="GET" className="card mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="form-label">From</label>
          <DatePicker name="from" defaultValue={searchParams.from} />
        </div>
        <div>
          <label className="form-label">To</label>
          <DatePicker name="to" defaultValue={searchParams.to} />
        </div>
        <button type="submit" className="btn-secondary">Apply</button>
        {(searchParams.from || searchParams.to) && (
          <a href="/accounting/trial-balance" className="text-sm text-gray-500 hover:underline self-end pb-1">Clear</a>
        )}
      </form>

      {!balanced && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Books don't balance — difference of {formatInr(diff)}. Check for missing journal lines.
        </div>
      )}
      {balanced && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Books balance.
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap sticky left-0 z-10 bg-gray-50">Code</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Account Name</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">Debit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Object.entries(groups).map(([type, rows]) => (
              <>
                <tr key={`header-${type}`} className="bg-gray-100">
                  <td colSpan={4} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                    {TYPE_LABELS[type] ?? type}
                  </td>
                </tr>
                {rows
                  .filter((r) => r.total_debit !== 0 || r.total_credit !== 0)
                  .map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap sticky left-0 z-10 bg-white">{r.account_code}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/accounting/ledger?account=${r.id}${searchParams.from ? `&from=${searchParams.from}` : ''}${searchParams.to ? `&to=${searchParams.to}` : ''}`}
                          className="text-purple-700 hover:underline"
                        >
                          {r.account_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">
                        {r.total_debit > 0 ? formatInr(r.total_debit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">
                        {r.total_credit > 0 ? formatInr(r.total_credit) : '—'}
                      </td>
                    </tr>
                  ))}
              </>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-bold">
            <tr>
              <td className="px-4 py-3" colSpan={2}>Total</td>
              <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatInr(totalDebit)}</td>
              <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${!balanced ? 'text-red-600' : ''}`}>
                {formatInr(totalCredit)}
              </td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
}
