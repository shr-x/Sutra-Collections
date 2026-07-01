import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import { DeleteExpenseButton } from './_buttons';

interface ExpenseRow {
  id: string;
  expense_date: string;
  description: string;
  amount: string;
  payment_mode: string | null;
  notes: string | null;
}

function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function fmtMoney(val: string) {
  return `₹${parseFloat(val).toFixed(2)}`;
}

export default async function ExpensesPage() {
  await requireSA();

  const res = await query<ExpenseRow>(`
    SELECT id, expense_date, description, amount, payment_mode, notes
    FROM expenses
    ORDER BY expense_date DESC
    LIMIT 200
  `);

  const expenses = res.rows;

  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Expenses</h1>
        <Link
          href="/sa-console-x7k2/expenses/new"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Expense
        </Link>
      </div>

      <div className="flex gap-4">
        <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
          <p className="text-xs text-gray-500">Showing</p>
          <p className="text-lg font-bold text-white">{expenses.length}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
          <p className="text-xs text-gray-500">Total (listed)</p>
          <p className="text-lg font-bold text-white">₹{total.toFixed(2)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-700/50">
            <tr>
              {['Date', 'Description', 'Amount', 'Mode', 'Notes', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                <td className="px-4 py-3 text-gray-300">{fmtDate(e.expense_date)}</td>
                <td className="px-4 py-3 text-white">{e.description}</td>
                <td className="px-4 py-3 font-medium text-white">{fmtMoney(e.amount)}</td>
                <td className="px-4 py-3 text-gray-400 capitalize">{e.payment_mode ?? '—'}</td>
                <td className="max-w-xs truncate px-4 py-3 text-gray-500">{e.notes ?? '—'}</td>
                <td className="px-4 py-3">
                  <DeleteExpenseButton id={e.id} />
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
                  No expenses found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
