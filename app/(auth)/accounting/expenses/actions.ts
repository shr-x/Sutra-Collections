'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { postExpense } from '@/lib/accounting';
import { logAudit } from '@/lib/audit';
import type { ActionResult } from '@/types';

const ExpenseSchema = z.object({
  category_id: z.string().uuid(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  description: z.string().min(1).max(500),
  amount: z.coerce.number().positive(),
  payment_mode: z.enum(['cash', 'bank']),
  notes: z.string().max(500).nullable().optional(),
});

// ─── Create a custom expense category inline (from the Record Expense form) ──
// Gets its own dedicated GL account (account_type='expense', next available
// numeric code) so it reports distinctly in the P&L/trial balance, matching
// how the seeded categories (Salaries/Rent/Utilities/Miscellaneous) are each
// wired to their own account rather than lumped into one generic bucket.
const CategoryNameSchema = z.string().trim().min(1).max(100);

export async function createExpenseCategoryAction(
  name: string
): Promise<{ success: boolean; category?: { id: string; name: string }; error?: string }> {
  await requireRole('accountant', 'admin');

  const parsed = CategoryNameSchema.safeParse(name);
  if (!parsed.success) return { success: false, error: 'Enter a category name.' };
  const trimmedName = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM expense_categories WHERE lower(name) = lower($1) LIMIT 1`,
      [trimmedName]
    );
    if (existing.rows[0]) {
      await client.query('ROLLBACK');
      return { success: true, category: existing.rows[0] }; // already exists — just reuse it
    }

    const codeRes = await client.query<{ next_code: string }>(
      `SELECT (COALESCE(MAX(account_code::int), 5100) + 1)::text AS next_code
       FROM accounts WHERE account_type='expense'`
    );
    const nextCode = codeRes.rows[0].next_code;

    const acctRes = await client.query<{ id: string }>(
      `INSERT INTO accounts (account_code, account_name, account_type, is_system)
       VALUES ($1, $2, 'expense', false) RETURNING id`,
      [nextCode, `${trimmedName} Expense`]
    );

    const catRes = await client.query<{ id: string; name: string }>(
      `INSERT INTO expense_categories (name, account_id) VALUES ($1, $2) RETURNING id, name`,
      [trimmedName, acctRes.rows[0].id]
    );

    await client.query('COMMIT');
    return { success: true, category: catRes.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createExpenseCategoryAction]', err);
    return { success: false, error: 'Failed to create category.' };
  } finally {
    client.release();
  }
}

export async function createExpenseAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole('accountant', 'admin');

  let parsed: z.infer<typeof ExpenseSchema>;
  try {
    const raw = Object.fromEntries(formData.entries());
    parsed = ExpenseSchema.parse(raw);
  } catch (e) {
    return { success: false, error: e instanceof z.ZodError ? e.errors[0].message : 'Invalid data' };
  }

  let expenseId: string;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get account_code for this category
      const catRes = await client.query<{ account_code: string }>(
        `SELECT a.account_code FROM expense_categories ec
         JOIN accounts a ON a.id = ec.account_id
         WHERE ec.id = $1`,
        [parsed.category_id]
      );
      if (!catRes.rows[0]) throw new Error('Unknown expense category');
      const accountCode = catRes.rows[0].account_code;

      const res = await client.query<{ id: string }>(
        `INSERT INTO expenses (category_id, expense_date, description, amount, payment_mode, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [parsed.category_id, parsed.expense_date, parsed.description,
         parsed.amount, parsed.payment_mode, parsed.notes ?? null, session.userId]
      );
      expenseId = res.rows[0].id;

      await postExpense({
        expenseId,
        expenseDate: parsed.expense_date,
        description: parsed.description,
        amount: parsed.amount,
        expenseAccountCode: accountCode,
        paymentMode: parsed.payment_mode,
        createdBy: session.userId,
      }, client);

      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to record expense' };
  }

  logAudit({ userId: session.userId, action: 'create', entityType: 'expense', entityId: expenseId!, entityLabel: parsed.description, newValue: { amount: parsed.amount } }).catch(() => {});
  redirect(`/accounting/expenses`);
}
