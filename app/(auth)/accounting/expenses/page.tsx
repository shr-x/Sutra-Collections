import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'Expenses' };

interface ExpenseRow {
  id: string;
  expense_date: string;
  description: string;
  amount: number;
  payment_mode: string;
  category_name: string;
  account_name: string;
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; category?: string };
}) {
  await requireRole('accountant', 'admin');

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (searchParams.from)     { params.push(searchParams.from);     conditions.push(`e.expense_date >= $${params.length}`); }
  if (searchParams.to)       { params.push(searchParams.to);       conditions.push(`e.expense_date <= $${params.length}`); }
  if (searchParams.category) { params.push(searchParams.category); conditions.push(`e.category_id = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [expensesRes, catsRes, totalRes] = await Promise.all([
    pool.query<ExpenseRow>(
      `SELECT e.id, e.expense_date, e.description, e.amount, e.payment_mode,
              ec.name AS category_name, a.account_name
       FROM expenses e
       JOIN expense_categories ec ON ec.id = e.category_id
       JOIN accounts a ON a.id = ec.account_id
       ${where}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT 200`,
      params
    ),
    pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM expense_categories ORDER BY name`
    ),
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(e.amount), 0) AS total FROM expenses e ${where}`,
      params
    ),
  ]);

  const rows  = expensesRes.rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  const total = Number(totalRes.rows[0]?.total ?? 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Expenses</h1>
        <Link href="/accounting/expenses/new" className="btn-primary">+ Record Expense</Link>
      </div>

      {/* Filters */}
      <form method="GET" className="card mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">📅 From</label>
          <DatePicker name="from" defaultValue={searchParams.from} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">📅 To</label>
          <DatePicker name="to" defaultValue={searchParams.to} />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-semibold text-gray-500">🏷️ Category</label>
          <select name="category" defaultValue={searchParams.category} className="form-input">
            <option value="">All categories</option>
            {catsRes.rows.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-full bg-purple-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700">Filter</button>
        {(searchParams.from || searchParams.to || searchParams.category) && (
          <a href="/accounting/expenses" className="self-end pb-2 text-sm text-gray-500 hover:underline">Clear</a>
        )}
      </form>

      {/* Total */}
      <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-red-700 font-medium">Total Expenses (filtered)</span>
        <span className="text-lg font-bold text-red-800">{formatInr(total)}</span>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Description</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Mode</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center">
                <span className="text-4xl">🧾</span>
                <p className="mt-2 text-sm font-medium text-gray-500">No expenses recorded yet</p>
              </td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="even:bg-gray-50/60 hover:bg-purple-50/50 transition-colors">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {new Date(row.expense_date).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3 text-gray-800">{row.description}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 text-xs font-medium">
                    {row.category_name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600">
                    {row.payment_mode}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-red-700 font-medium">
                  {formatInr(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
