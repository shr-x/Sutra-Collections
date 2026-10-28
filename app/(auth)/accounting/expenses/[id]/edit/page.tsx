import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import ExpenseForm from '../../expense-form';
import { updateExpenseAction } from '../../actions';

export const metadata: Metadata = { title: 'Edit Expense' };

export default async function EditExpensePage({ params }: { params: { id: string } }) {
  await requireRole('accountant', 'admin');

  const [expRes, catsRes, payrollRes] = await Promise.all([
    pool.query<{ expense_date: string; category_id: string; description: string; amount: string; payment_mode: 'cash' | 'bank'; notes: string | null }>(
      `SELECT expense_date::text, category_id, description, amount::text, payment_mode, notes FROM expenses WHERE id = $1`,
      [params.id]
    ).catch(() => ({ rows: [] })),
    pool.query<{ id: string; name: string }>(`SELECT id, name FROM expense_categories ORDER BY name`),
    pool.query(`SELECT 1 FROM payroll_runs pr JOIN journal_entries je ON je.id = pr.expense_entry_id
       WHERE je.reference_id = $1 LIMIT 1`, [params.id]).catch(() => ({ rows: [] })),
  ]);
  const e = expRes.rows[0];
  if (!e) notFound();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Edit Expense</h1>
          <p className="text-sm text-gray-500">
            Changing the date, category, amount, payment mode or description reverses the original journal entry and posts a new one.
          </p>
        </div>
      </div>
      {payrollRes.rows.length > 0 ? (
        <div className="card max-w-2xl text-sm text-gray-700">
          This expense was created by Payroll and can only be corrected from{' '}
          <Link href="/staff/payroll" className="text-purple-700 hover:underline">Staff → Payroll</Link>.
        </div>
      ) : (
        <ExpenseForm
          categories={catsRes.rows}
          expense={{ ...e, amount: Number(e.amount) }}
          action={updateExpenseAction.bind(null, params.id)}
        />
      )}
    </div>
  );
}
