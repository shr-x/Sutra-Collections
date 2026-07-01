'use server';

import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { postExpense } from '@/lib/accounting';
import { revalidatePath } from 'next/cache';

export interface RunPayrollInput {
  month: number;
  year: number;
  paymentMode: 'cash' | 'bank';
  entries: {
    userId: string;
    baseSalary: number;
    daysPresent: number;
    halfDays: number;
    totalDays: number;
    amountPaid: number;
  }[];
}

export async function runPayrollAction(input: RunPayrollInput): Promise<{ saved: number; errors: string[] }> {
  const session = await requireRole('admin');

  const { month, year, paymentMode, entries } = input;
  const errors: string[] = [];
  let saved = 0;

  // Find 'Salaries' expense category
  const catRes = await pool.query<{ id: string; account_code: string }>(
    `SELECT ec.id, a.account_code
     FROM expense_categories ec JOIN accounts a ON a.id = ec.account_id
     WHERE LOWER(ec.name) = 'salaries' LIMIT 1`
  );
  if (!catRes.rows.length) {
    throw new Error('Salaries expense category not found. Run Phase 4 seed SQL.');
  }
  const { id: categoryId, account_code: accountCode } = catRes.rows[0];

  const monthLabel = new Date(year, month - 1).toLocaleString('en-IN', {
    month: 'long', year: 'numeric',
  });

  for (const e of entries) {
    if (e.amountPaid <= 0) continue;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create expense record
      const expenseDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
      const expRes = await client.query<{ id: string }>(
        `INSERT INTO expenses (category_id, description, amount, expense_date, payment_mode, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [categoryId, `Salary — ${monthLabel}`, e.amountPaid, expenseDate, paymentMode, session.userId]
      );
      const expenseId = expRes.rows[0].id;

      // Post journal entry
      const journalEntryId = await postExpense({
        expenseId,
        expenseDate,
        description: `Salary — ${monthLabel}`,
        amount: e.amountPaid,
        expenseAccountCode: accountCode,
        paymentMode,
        createdBy: session.userId,
      }, client);

      // Create payroll run record
      await client.query(
        `INSERT INTO payroll_runs
           (user_id, month, year, base_salary, days_present, half_days, total_days, amount_paid, expense_entry_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (user_id, month, year) DO UPDATE SET
           base_salary = EXCLUDED.base_salary,
           days_present = EXCLUDED.days_present,
           half_days = EXCLUDED.half_days,
           total_days = EXCLUDED.total_days,
           amount_paid = EXCLUDED.amount_paid,
           expense_entry_id = EXCLUDED.expense_entry_id`,
        [e.userId, month, year, e.baseSalary, e.daysPresent, e.halfDays, e.totalDays, e.amountPaid, journalEntryId]
      );

      await client.query('COMMIT');
      saved++;
    } catch (err) {
      await client.query('ROLLBACK');
      errors.push(`User ${e.userId}: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      client.release();
    }
  }

  revalidatePath('/staff/payroll');
  return { saved, errors };
}

export async function updateBaseSalaryAction(userId: string, baseSalary: number): Promise<void> {
  await requireRole('admin');
  await pool.query('UPDATE users SET base_salary = $1 WHERE id = $2', [baseSalary, userId]);
  revalidatePath('/staff/payroll');
}
