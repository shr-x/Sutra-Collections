'use server';
import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const CustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  credit_limit: z.coerce.number().min(0).default(0),
});

export interface CustomerState { error?: string }

export async function createSACustomerAction(_prev: CustomerState | null, formData: FormData): Promise<CustomerState> {
  await requireSA();
  const parsed = CustomerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(
    `INSERT INTO customers (name, phone, address, gstin, credit_limit) VALUES ($1,$2,$3,$4,$5)`,
    [d.name, d.phone || null, d.address || '', d.gstin || null, d.credit_limit]
  );
  redirect('/sa-console-x7k2/customers');
}

export async function updateSACustomerAction(id: string, _prev: CustomerState | null, formData: FormData): Promise<CustomerState> {
  await requireSA();
  const parsed = CustomerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(
    `UPDATE customers SET name=$1, phone=$2, address=$3, gstin=$4, credit_limit=$5 WHERE id=$6`,
    [d.name, d.phone || null, d.address || '', d.gstin || null, d.credit_limit, id]
  );
  redirect('/sa-console-x7k2/customers');
}

export async function hardDeleteCustomerAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  // Only allow hard delete if no invoices reference this customer
  const check = await query(`SELECT id FROM invoices WHERE customer_id=$1 LIMIT 1`, [id]);
  if (check.rows.length > 0) {
    // Soft delete instead
    await query(`UPDATE customers SET deleted_at=NOW() WHERE id=$1`, [id]);
  } else {
    await query(`DELETE FROM customers WHERE id=$1`, [id]);
  }
  revalidatePath('/sa-console-x7k2/customers');
}

export async function restoreSACustomerAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  await query(`UPDATE customers SET deleted_at=NULL WHERE id=$1`, [id]);
  revalidatePath('/sa-console-x7k2/customers');
}
