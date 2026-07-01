'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';

const WarehouseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  address: z.string().max(500).optional().default(''),
  is_active: z.boolean().default(true),
});

export interface WarehouseState { error?: string }

export async function createWarehouseAction(
  _prev: WarehouseState | null,
  formData: FormData
): Promise<WarehouseState> {
  await requireRole('admin');

  const parsed = WarehouseSchema.safeParse({
    name: formData.get('name'),
    address: formData.get('address') ?? '',
    is_active: formData.get('is_active') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  try {
    await query(
      'INSERT INTO warehouses (name, address, is_active) VALUES ($1, $2, $3)',
      [parsed.data.name, parsed.data.address, parsed.data.is_active]
    );
    revalidatePath('/settings/warehouses');
  } catch {
    return { error: 'Failed to create warehouse. Please try again.' };
  }

  redirect('/settings/warehouses');
}

export async function updateWarehouseAction(
  id: string,
  _prev: WarehouseState | null,
  formData: FormData
): Promise<WarehouseState> {
  await requireRole('admin');

  const parsed = WarehouseSchema.safeParse({
    name: formData.get('name'),
    address: formData.get('address') ?? '',
    is_active: formData.get('is_active') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  try {
    await query(
      'UPDATE warehouses SET name=$1, address=$2, is_active=$3 WHERE id=$4',
      [parsed.data.name, parsed.data.address, parsed.data.is_active, id]
    );
    revalidatePath('/settings/warehouses');
  } catch {
    return { error: 'Failed to update warehouse.' };
  }

  redirect('/settings/warehouses');
}

export async function deleteWarehouseAction(formData: FormData) {
  await requireRole('admin');
  const id = formData.get('id') as string;
  try {
    await query('UPDATE warehouses SET is_active=FALSE WHERE id=$1', [id]);
    revalidatePath('/settings/warehouses');
  } catch {
    // Non-fatal for now; page will show stale data
  }
}

export async function activateWarehouseAction(formData: FormData) {
  await requireRole('admin');
  const id = formData.get('id') as string;
  try {
    await query('UPDATE warehouses SET is_active=TRUE WHERE id=$1', [id]);
    revalidatePath('/settings/warehouses');
  } catch {
    // Non-fatal
  }
}
