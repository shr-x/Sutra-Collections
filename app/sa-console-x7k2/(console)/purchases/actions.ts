'use server';

import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export interface PurchaseState {
  error?: string;
}

const PurchaseSchema = z.object({
  invoice_number: z.string().optional(),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  supplier_id: z.string().uuid().optional().or(z.literal('')),
  status: z.enum(['draft', 'received', 'cancelled']).default('received'),
  payment_mode: z.string().optional(),
  grand_total: z.coerce.number().min(0),
  amount_paid: z.coerce.number().min(0),
  notes: z.string().optional(),
});

export async function createSAPurchaseAction(
  _prev: PurchaseState | null,
  formData: FormData
): Promise<PurchaseState> {
  await requireSA();
  const parsed = PurchaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(
    `INSERT INTO purchase_invoices
       (invoice_number, invoice_date, supplier_id, status, payment_mode, grand_total, amount_paid, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      d.invoice_number || null,
      d.invoice_date,
      d.supplier_id || null,
      d.status,
      d.payment_mode || null,
      d.grand_total,
      d.amount_paid,
      d.notes || null,
    ]
  );
  redirect('/sa-console-x7k2/purchases');
}

export async function deleteSAPurchaseAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  await query(`DELETE FROM purchase_invoice_items WHERE purchase_invoice_id=$1`, [id]);
  await query(`DELETE FROM purchase_invoices WHERE id=$1`, [id]);
  revalidatePath('/sa-console-x7k2/purchases');
}
