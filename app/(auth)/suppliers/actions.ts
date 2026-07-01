'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const SupplierSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  phone: z.string().min(1, 'Phone is required').max(20),
  gstin: z.string().regex(GSTIN_RE, 'Invalid GSTIN').optional().or(z.literal('')),
  address: z.string().max(500).default(''),
});

export interface SupplierState { error?: string }

function parse(formData: FormData) {
  return {
    name: formData.get('name'),
    phone: formData.get('phone'),
    gstin: (formData.get('gstin') as string | null) || '',
    address: formData.get('address') ?? '',
  };
}

export async function createSupplierAction(
  _prev: SupplierState | null,
  formData: FormData
): Promise<SupplierState> {
  const session = await requireRole('admin');
  const parsed = SupplierSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  try {
    const res = await query<{ id: string }>(
      'INSERT INTO suppliers (name, phone, gstin, address) VALUES ($1,$2,$3,$4) RETURNING id',
      [d.name, d.phone, d.gstin || null, d.address]
    );
    logAudit({ userId: session.userId, action: 'create', entityType: 'supplier', entityId: res.rows[0].id, entityLabel: d.name }).catch(() => {});
    revalidatePath('/suppliers');
  } catch {
    return { error: 'Failed to create supplier.' };
  }
  redirect('/suppliers');
}

export async function updateSupplierAction(
  id: string,
  _prev: SupplierState | null,
  formData: FormData
): Promise<SupplierState> {
  const session = await requireRole('admin');
  const parsed = SupplierSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  try {
    await query(
      'UPDATE suppliers SET name=$1,phone=$2,gstin=$3,address=$4 WHERE id=$5',
      [d.name, d.phone, d.gstin || null, d.address, id]
    );
    logAudit({ userId: session.userId, action: 'update', entityType: 'supplier', entityId: id, entityLabel: d.name }).catch(() => {});
    revalidatePath('/suppliers');
    revalidatePath(`/suppliers/${id}`);
  } catch {
    return { error: 'Failed to update supplier.' };
  }
  redirect(`/suppliers/${id}`);
}

export async function deleteSupplierAction(formData: FormData) {
  const session = await requireRole('admin');
  const id = formData.get('id') as string;
  try {
    const nameRes = await query<{ name: string }>('SELECT name FROM suppliers WHERE id=$1', [id]);
    await query('DELETE FROM suppliers WHERE id=$1', [id]);
    logAudit({ userId: session.userId, action: 'delete', entityType: 'supplier', entityId: id, entityLabel: nameRes.rows[0]?.name }).catch(() => {});
    revalidatePath('/suppliers');
  } catch {
    // FK violation means supplier has purchase records — caller should show an error
  }
}

export async function softDeleteSupplierAction(formData: FormData) {
  const session = await requireRole('admin');
  const id = formData.get('id') as string;
  const nameRes = await query<{ name: string }>('SELECT name FROM suppliers WHERE id=$1', [id]);
  await query(`UPDATE suppliers SET deleted_at = NOW() WHERE id = $1`, [id]);
  logAudit({ userId: session.userId, action: 'delete', entityType: 'supplier', entityId: id, entityLabel: nameRes.rows[0]?.name }).catch(() => {});
  revalidatePath('/suppliers');
}

export async function restoreSupplierAction(formData: FormData) {
  const session = await requireRole('admin');
  const id = formData.get('id') as string;
  const nameRes = await query<{ name: string }>('SELECT name FROM suppliers WHERE id=$1', [id]);
  await query(`UPDATE suppliers SET deleted_at = NULL WHERE id = $1`, [id]);
  logAudit({ userId: session.userId, action: 'update', entityType: 'supplier', entityId: id, entityLabel: nameRes.rows[0]?.name, newValue: { restored: true } }).catch(() => {});
  revalidatePath('/suppliers');
}
