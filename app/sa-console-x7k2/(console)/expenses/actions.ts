'use server';

import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export interface ExpenseState {
  error?: string;
}

// Actual expenses table columns (from DB introspection):
//   id, expense_date, category_id (uuid FK — omitted here), description,
//   amount, payment_mode, journal_entry_id (uuid FK — omitted), created_by (uuid FK — omitted), notes

export async function createSAExpenseAction(
  _prev: ExpenseState | null,
  formData: FormData
): Promise<ExpenseState> {
  await requireSA();

  const amount = parseFloat(formData.get('amount') as string);
  if (isNaN(amount) || amount <= 0) return { error: 'Amount must be a positive number.' };

  const description = (formData.get('description') as string | null)?.trim();
  if (!description) return { error: 'Description is required.' };

  const expense_date = formData.get('expense_date') as string | null;
  if (!expense_date) return { error: 'Date is required.' };

  const payment_mode = (formData.get('payment_mode') as string | null) || null;
  const notes = (formData.get('notes') as string | null)?.trim() || null;

  await query(
    `INSERT INTO expenses (expense_date, description, amount, payment_mode, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [expense_date, description, amount, payment_mode, notes]
  );
  redirect('/sa-console-x7k2/expenses');
}

export async function deleteSAExpenseAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  await query(`DELETE FROM expenses WHERE id=$1`, [id]);
  revalidatePath('/sa-console-x7k2/expenses');
}
