'use server';
import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export interface TailoringState { error?: string }

// Stage values match the DB CHECK constraint: placed | production | ready | delivered
const EditOrderSchema = z.object({
  stage: z.enum(['placed', 'production', 'ready', 'delivered']),
  tailor_id: z.string().uuid().optional().or(z.literal('')),
  price: z.coerce.number().min(0),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  color_fabric: z.string().optional(),
  notes: z.string().optional(),
});

export async function updateSATailoringAction(
  _prev: TailoringState | null,
  formData: FormData
): Promise<TailoringState> {
  await requireSA();
  const id = formData.get('id') as string;
  if (!id) return { error: 'Order ID missing.' };
  const parsed = EditOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(
    `UPDATE tailoring_orders
     SET stage=$1, tailor_id=$2, price=$3, due_date=$4, color_fabric=$5, notes=$6, updated_at=NOW()
     WHERE id=$7`,
    [d.stage, d.tailor_id || null, d.price, d.due_date || null, d.color_fabric || null, d.notes || null, id]
  );
  redirect('/sa-console-x7k2/tailoring');
}

export async function deleteSATailoringAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  await query(`DELETE FROM tailoring_orders WHERE id=$1`, [id]);
  revalidatePath('/sa-console-x7k2/tailoring');
}
