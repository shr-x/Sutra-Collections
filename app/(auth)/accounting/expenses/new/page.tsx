import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import ExpenseForm from '../expense-form';

export const metadata: Metadata = { title: 'Record Expense' };

export default async function NewExpensePage() {
  await requireRole('accountant', 'admin');

  const catsRes = await pool.query<{ id: string; name: string }>(
    `SELECT ec.id, ec.name FROM expense_categories ec ORDER BY ec.name`
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Record Expense</h1>
          <p className="text-sm text-gray-500">Posts a journal entry automatically.</p>
        </div>
      </div>
      <ExpenseForm categories={catsRes.rows} />
    </div>
  );
}
