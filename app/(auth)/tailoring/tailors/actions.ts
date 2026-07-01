'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';

const TailorSchema = z.object({
  name:      z.string().min(1, 'Name is required').max(255),
  phone:     z.string().max(20).optional(),
  specialty: z.string().max(255).optional(),
  notes:     z.string().max(1000).optional(),
});

export async function createTailorAction(formData: FormData): Promise<void> {
  await requireRole('admin');
  const parsed = TailorSchema.safeParse({
    name:      formData.get('name'),
    phone:     formData.get('phone') || undefined,
    specialty: formData.get('specialty') || undefined,
    notes:     formData.get('notes') || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.errors[0].message);
  const { name, phone, specialty, notes } = parsed.data;
  const res = await query<{ id: string }>(
    `INSERT INTO tailors (name, phone, specialty, notes) VALUES ($1,$2,$3,$4) RETURNING id`,
    [name, phone ?? null, specialty ?? null, notes ?? null]
  );
  revalidatePath('/tailoring/tailors');
  redirect(`/tailoring/tailors/${res.rows[0].id}`);
}

export async function updateTailorAction(formData: FormData): Promise<void> {
  await requireRole('admin');
  const id = formData.get('id') as string;
  if (!id) throw new Error('Missing ID');
  const parsed = TailorSchema.safeParse({
    name:      formData.get('name'),
    phone:     formData.get('phone') || undefined,
    specialty: formData.get('specialty') || undefined,
    notes:     formData.get('notes') || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.errors[0].message);
  const { name, phone, specialty, notes } = parsed.data;
  await query(
    `UPDATE tailors SET name=$1, phone=$2, specialty=$3, notes=$4 WHERE id=$5`,
    [name, phone ?? null, specialty ?? null, notes ?? null, id]
  );
  revalidatePath('/tailoring/tailors');
  revalidatePath(`/tailoring/tailors/${id}`);
  redirect(`/tailoring/tailors/${id}`);
}

export async function toggleTailorActiveAction(formData: FormData): Promise<void> {
  await requireRole('admin');
  const id       = formData.get('id') as string;
  const isActive = formData.get('is_active') === 'true';
  await query(`UPDATE tailors SET is_active=$1 WHERE id=$2`, [!isActive, id]);
  revalidatePath('/tailoring/tailors');
  revalidatePath(`/tailoring/tailors/${id}`);
}
