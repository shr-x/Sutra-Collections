'use server';
import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const SupplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  gstin: z.string().optional(),
});
export interface SupplierState { error?: string }

export async function createSASupplierAction(_prev: SupplierState | null, formData: FormData): Promise<SupplierState> {
  await requireSA();
  const parsed = SupplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(`INSERT INTO suppliers (name, phone, email, address, gstin) VALUES ($1,$2,$3,$4,$5)`,
    [d.name, d.phone||null, d.email||null, d.address||'', d.gstin||null]);
  redirect('/sa-console-x7k2/suppliers');
}

export async function updateSASupplierAction(id: string, _prev: SupplierState | null, formData: FormData): Promise<SupplierState> {
  await requireSA();
  const parsed = SupplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(`UPDATE suppliers SET name=$1, phone=$2, email=$3, address=$4, gstin=$5 WHERE id=$6`,
    [d.name, d.phone||null, d.email||null, d.address||'', d.gstin||null, id]);
  redirect('/sa-console-x7k2/suppliers');
}

export async function deleteSASupplierAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  const check = await query(`SELECT id FROM purchase_invoices WHERE supplier_id=$1 LIMIT 1`, [id]);
  if (check.rows.length > 0) return; // Can't delete with linked purchases
  await query(`DELETE FROM suppliers WHERE id=$1`, [id]);
  revalidatePath('/sa-console-x7k2/suppliers');
}
