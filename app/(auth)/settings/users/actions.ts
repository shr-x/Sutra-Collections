'use server';

import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const UserSchema = z.object({
  name:              z.string().min(1, 'Name is required').trim(),
  email:             z.string().email('Invalid email').toLowerCase(),
  role:              z.enum(['admin', 'staff', 'accountant']),
  warehouse_id:      z.string().uuid().optional().nullable(),
  access_expires_at: z.string().optional().nullable(),
  base_salary:       z.coerce.number().min(0).default(0),
});

const NewUserSchema = UserSchema.extend({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export interface FormState { error?: string; fieldErrors?: Record<string, string[]> }

export async function createUserAction(
  _prev: FormState | null,
  formData: FormData
): Promise<FormState> {
  await requireRole('admin');

  const raw = {
    name:              formData.get('name'),
    email:             formData.get('email'),
    password:          formData.get('password'),
    role:              formData.get('role'),
    warehouse_id:      formData.get('warehouse_id') || null,
    access_expires_at: formData.get('access_expires_at') || null,
    base_salary:       formData.get('base_salary') || '0',
  };

  const parsed = NewUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { name, email, password, role, warehouse_id, access_expires_at, base_salary } = parsed.data;

  const dup = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (dup.rows.length > 0) return { error: 'A user with that email already exists.' };

  const password_hash = await bcrypt.hash(password, 12);
  const expiresAt = access_expires_at ? new Date(access_expires_at) : null;

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, warehouse_id, access_expires_at, base_salary, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`,
    [name, email, password_hash, role, warehouse_id ?? null, expiresAt, base_salary]
  );

  revalidatePath('/settings/users');
  redirect('/settings/users');
}

export async function updateUserAction(
  userId: string,
  _prev: FormState | null,
  formData: FormData
): Promise<FormState> {
  await requireRole('admin');

  const raw = {
    name:              formData.get('name'),
    email:             formData.get('email'),
    role:              formData.get('role'),
    warehouse_id:      formData.get('warehouse_id') || null,
    access_expires_at: formData.get('access_expires_at') || null,
    base_salary:       formData.get('base_salary') || '0',
  };

  const parsed = UserSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { name, email, role, warehouse_id, access_expires_at, base_salary } = parsed.data;
  const expiresAt = access_expires_at ? new Date(access_expires_at) : null;

  // If email changed, check uniqueness
  const dup = await pool.query('SELECT id FROM users WHERE email=$1 AND id!=$2', [email, userId]);
  if (dup.rows.length > 0) return { error: 'A user with that email already exists.' };

  // If a new password was supplied, re-hash it
  const newPass = formData.get('password') as string | null;
  if (newPass && newPass.trim().length > 0) {
    if (newPass.trim().length < 6) return { error: 'Password must be at least 6 characters.' };
    const hash = await bcrypt.hash(newPass.trim(), 12);
    await pool.query(
      `UPDATE users SET name=$1,email=$2,password_hash=$3,role=$4,warehouse_id=$5,
              access_expires_at=$6,base_salary=$7 WHERE id=$8`,
      [name, email, hash, role, warehouse_id ?? null, expiresAt, base_salary, userId]
    );
  } else {
    await pool.query(
      `UPDATE users SET name=$1,email=$2,role=$3,warehouse_id=$4,
              access_expires_at=$5,base_salary=$6 WHERE id=$7`,
      [name, email, role, warehouse_id ?? null, expiresAt, base_salary, userId]
    );
  }

  revalidatePath('/settings/users');
  redirect('/settings/users');
}

export async function toggleUserActiveAction(userId: string, isActive: boolean): Promise<void> {
  await requireRole('admin');
  await pool.query('UPDATE users SET is_active=$1 WHERE id=$2', [isActive, userId]);
  revalidatePath('/settings/users');
}
