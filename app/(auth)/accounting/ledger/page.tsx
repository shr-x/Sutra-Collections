import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'General Ledger' };

interface Account { id: string; account_code: string; account_name: string; account_type: string; }
interface LedgerLine {
  journal_entry_id: string;
  entry_date: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: { account?: string; from?: string; to?: string };
}) {
  await requireRole('accountant', 'admin');

  const accountsRes = await pool.query<Account>(
    `SELECT id, account_code, account_name, account_type FROM accounts WHERE is_active=TRUE ORDER BY account_code`
  );
  const accounts = accountsRes.rows;

  const selectedId = searchParams.account;
  let lines: LedgerLine[] = [];
  let selectedAccount: Account | undefined;
  let openingBalance = 0;

  if (selectedId) {
    selectedAccount = accounts.find((a) => a.id === selectedId);

    // Opening balance: all journal lines for this account BEFORE from-date
    if (searchParams.from && selectedAccount) {
      const obRes = await pool.query<{ balance: string }>(
        `SELECT
           CASE '${selectedAccount.account_type}'
             WHEN 'asset'   THEN COALESCE(SUM(jl.debit_amount),0) - COALESCE(SUM(jl.credit_amount),0)
             WHEN 'expense' THEN COALESCE(SUM(jl.debit_amount),0) - COALESCE(SUM(jl.credit_amount),0)
             ELSE COALESCE(SUM(jl.credit_amount),0) - COALESCE(SUM(jl.debit_amount),0)
           END AS balance
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.account_id = $1 AND je.entry_date < $2`,
        [selectedId, searchParams.from]
      );
      openingBalance = Number(obRes.rows[0]?.balance ?? 0);
    }

    const conditions = [`jl.account_id = $1`];
    const qParams: unknown[] = [selectedId];
    if (searchParams.from) { qParams.push(searchParams.from); conditions.push(`je.entry_date >= $${qParams.length}`); }
    if (searchParams.to)   { qParams.push(searchParams.to);   conditions.push(`je.entry_date <= $${qParams.length}`); }

    const linesRes = await pool.query<LedgerLine>(
      `SELECT jl.journal_entry_id, je.entry_date, je.description,
              jl.debit_amount, jl.credit_amount
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY je.entry_date, je.created_at`,
      qParams
    );
    lines = linesRes.rows.map((r) => ({
      ...r,
      debit_amount:  Number(r.debit_amount),
      credit_amount: Number(r.credit_amount),
    }));
  }

  // Compute running balance
  const isDebitNormal = selectedAccount
    ? ['asset', 'expense'].includes(selectedAccount.account_type)
    : true;

  let running = openingBalance;
  const linesWithBalance = lines.map((l) => {
    running += isDebitNormal
      ? l.debit_amount - l.credit_amount
      : l.credit_amount - l.debit_amount;
    return { ...l, balance: running };
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">General Ledger</h1>
      </div>

      {/* Filters */}
      <form method="GET" className="card mb-4 flex flex-wrap items-end gap-4">
        <div className="w-full sm:flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-semibold text-gray-500">Account</label>
          <select
            name="account"
            defaultValue={selectedId}
            className="input w-full"
          >
            <option value="">— select account —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_code} — {a.account_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">From</label>
          <DatePicker name="from" defaultValue={searchParams.from} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">To</label>
          <DatePicker name="to" defaultValue={searchParams.to} />
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-full bg-purple-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 transition-colors"
        >
          View
        </button>
      </form>

      {selectedAccount ? (
        <>
          <div className="mb-3">
            <h2 className="text-base font-semibold text-gray-800">
              {selectedAccount.account_code} — {selectedAccount.account_name}
            </h2>
            <p className="text-xs text-gray-500 capitalize">{selectedAccount.account_type} account</p>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap sticky left-0 z-10 bg-gray-50">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {searchParams.from && (
                  <tr className="bg-blue-50">
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap sticky left-0 z-10 bg-blue-50">—</td>
                    <td className="px-4 py-2 text-xs text-gray-500 italic">Opening Balance</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500 whitespace-nowrap">—</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500 whitespace-nowrap">—</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap">
                      {formatInr(openingBalance)}
                    </td>
                  </tr>
                )}
                {linesWithBalance.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No transactions in this period.</td></tr>
                )}
                {linesWithBalance.map((l, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 sticky left-0 z-10 bg-white">
                      {new Date(l.entry_date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/accounting/journal/${l.journal_entry_id}`}
                        className="text-purple-700 hover:underline">
                        {l.description}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">
                      {l.debit_amount > 0 ? formatInr(l.debit_amount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">
                      {l.credit_amount > 0 ? formatInr(l.credit_amount) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap ${l.balance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {l.balance < 0 ? `-${formatInr(Math.abs(l.balance))}` : formatInr(l.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {linesWithBalance.length > 0 && (
                <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                  <tr className="font-semibold">
                    <td className="px-4 py-3" colSpan={2}>Closing Balance</td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {formatInr(lines.reduce((s, l) => s + l.debit_amount, 0))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {formatInr(lines.reduce((s, l) => s + l.credit_amount, 0))}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold whitespace-nowrap ${running < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {running < 0 ? `-${formatInr(Math.abs(running))}` : formatInr(running)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card flex flex-col items-center py-12 text-center text-gray-400">
          <span className="text-4xl mb-3">📖</span>
          <p className="text-sm">Select an account above to view its ledger.</p>
        </div>
      )}
    </div>
  );
}
