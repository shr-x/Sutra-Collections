'use server';
import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export interface SchemeState { error?: string }

// scheme_type matches DB CHECK: buy_x_get_y | flat | percent | seasonal
const SchemeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  scheme_type: z.enum(['buy_x_get_y', 'flat', 'percent', 'seasonal']),
  is_active: z.boolean().default(true),
  valid_from: z.string().optional().or(z.literal('')),
  valid_until: z.string().optional().or(z.literal('')),
  buy_quantity: z.coerce.number().optional(),
  get_quantity: z.coerce.number().optional(),
  discount_value: z.coerce.number().optional(),
  min_order_value: z.coerce.number().optional(),
});

export async function createSASchemeAction(
  _prev: SchemeState | null,
  formData: FormData
): Promise<SchemeState> {
  await requireSA();
  const raw = { ...Object.fromEntries(formData), is_active: formData.get('is_active') === 'on' };
  const parsed = SchemeSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(
    `INSERT INTO discount_schemes
       (name, scheme_type, is_active, valid_from, valid_until, buy_quantity, get_quantity, discount_value, min_order_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      d.name, d.scheme_type, d.is_active,
      d.valid_from || null, d.valid_until || null,
      d.buy_quantity ?? null, d.get_quantity ?? null,
      d.discount_value ?? null, d.min_order_value ?? null,
    ]
  );
  redirect('/sa-console-x7k2/schemes');
}

export async function updateSASchemeAction(
  _prev: SchemeState | null,
  formData: FormData
): Promise<SchemeState> {
  await requireSA();
  const id = formData.get('id') as string;
  if (!id) return { error: 'Scheme ID missing.' };
  const raw = { ...Object.fromEntries(formData), is_active: formData.get('is_active') === 'on' };
  const parsed = SchemeSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(
    `UPDATE discount_schemes
     SET name=$1, scheme_type=$2, is_active=$3, valid_from=$4, valid_until=$5,
         buy_quantity=$6, get_quantity=$7, discount_value=$8, min_order_value=$9
     WHERE id=$10`,
    [
      d.name, d.scheme_type, d.is_active,
      d.valid_from || null, d.valid_until || null,
      d.buy_quantity ?? null, d.get_quantity ?? null,
      d.discount_value ?? null, d.min_order_value ?? null,
      id,
    ]
  );
  redirect('/sa-console-x7k2/schemes');
}

export async function toggleSASchemeAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  await query(`UPDATE discount_schemes SET is_active = NOT is_active WHERE id=$1`, [id]);
  revalidatePath('/sa-console-x7k2/schemes');
}

export async function deleteSASchemeAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  await query(`DELETE FROM discount_schemes WHERE id=$1`, [id]);
  revalidatePath('/sa-console-x7k2/schemes');
}
