'use server';

import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export interface InvoiceState {
  error?: string;
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export async function cancelInvoiceAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  await query(`UPDATE invoices SET status='cancelled' WHERE id=$1`, [id]);
  revalidatePath('/sa-console-x7k2/invoices');
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteInvoiceAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  await query(`DELETE FROM invoice_items WHERE invoice_id=$1`, [id]);
  await query(`DELETE FROM invoices WHERE id=$1`, [id]);
  revalidatePath('/sa-console-x7k2/invoices');
}

// ── Edit (header fields only) ─────────────────────────────────────────────────

const EditInvoiceSchema = z.object({
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  status: z.enum(['draft', 'paid', 'unpaid', 'cancelled']),
  payment_mode: z.string().optional(),
  grand_total: z.coerce.number().min(0),
  amount_paid: z.coerce.number().min(0),
  notes: z.string().optional(),
});

export async function updateInvoiceAction(
  id: string,
  _prev: InvoiceState | null,
  formData: FormData
): Promise<InvoiceState> {
  await requireSA();
  const parsed = EditInvoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(
    `UPDATE invoices
     SET invoice_date=$1, status=$2, payment_mode=$3, grand_total=$4, amount_paid=$5, notes=$6
     WHERE id=$7`,
    [d.invoice_date, d.status, d.payment_mode || null, d.grand_total, d.amount_paid, d.notes || null, id]
  );
  redirect('/sa-console-x7k2/invoices');
}

// ── Create ────────────────────────────────────────────────────────────────────

const NewInvoiceSchema = z.object({
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  customer_id: z.string().uuid().optional().or(z.literal('')),
  invoice_number: z.string().min(1, 'Invoice number is required'),
  payment_mode: z.enum(['cash', 'card', 'upi', 'credit']).default('cash'),
  grand_total: z.coerce.number().min(0),
  amount_paid: z.coerce.number().min(0),
  notes: z.string().optional(),
  status: z.enum(['draft', 'paid', 'unpaid']).default('paid'),
});

export async function createSAInvoiceAction(
  _prev: InvoiceState | null,
  formData: FormData
): Promise<InvoiceState> {
  await requireSA();
  const parsed = NewInvoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(
    `INSERT INTO invoices
       (invoice_number, invoice_date, customer_id, status, payment_mode, grand_total, amount_paid, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      d.invoice_number,
      d.invoice_date,
      d.customer_id || null,
      d.status,
      d.payment_mode,
      d.grand_total,
      d.amount_paid,
      d.notes || null,
    ]
  );
  redirect('/sa-console-x7k2/invoices');
}
