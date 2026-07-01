'use server';

import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

// ── Create User ──────────────────────────────────────────────────────────────

const CreateUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  role: z.enum(['admin', 'staff', 'accountant'], { required_error: 'Role is required' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  warehouse_id: z.string().uuid().optional().or(z.literal('')),
});

export interface UserFormState {
  error?: string;
}

export async function createUserAction(
  _prevState: UserFormState | null,
  formData: FormData
): Promise<UserFormState> {
  await requireSA();

  const parsed = CreateUserSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    role: formData.get('role'),
    password: formData.get('password'),
    warehouse_id: formData.get('warehouse_id') || '',
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const { name, email, role, password, warehouse_id } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await query(
      `INSERT INTO users (name, email, password_hash, role, warehouse_id, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [name, email, passwordHash, role, warehouse_id || null]
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { error: 'A user with that email already exists.' };
    }
    return { error: 'Failed to create user.' };
  }

  redirect('/sa-console-x7k2/users');
}

// ── Edit User ────────────────────────────────────────────────────────────────

const EditUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  role: z.enum(['admin', 'staff', 'accountant']),
  is_active: z.enum(['true', 'false']),
  base_salary: z.string().optional(),
  password: z.string().optional(),
  access_expires_at: z.string().optional(),
  warehouse_id: z.string().uuid().optional().or(z.literal('')),
});

export async function editUserAction(
  _prevState: UserFormState | null,
  formData: FormData
): Promise<UserFormState> {
  await requireSA();

  const id = formData.get('id') as string;
  if (!id) return { error: 'User ID is missing.' };

  const parsed = EditUserSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    role: formData.get('role'),
    is_active: formData.get('is_active'),
    base_salary: formData.get('base_salary') || '0',
    password: formData.get('password') || '',
    access_expires_at: formData.get('access_expires_at') || '',
    warehouse_id: formData.get('warehouse_id') || '',
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const { name, email, role, is_active, base_salary, password, access_expires_at, warehouse_id } =
    parsed.data;

  // Build SET clause dynamically so we only hash if a new password was given
  const params: unknown[] = [
    name,
    email,
    role,
    is_active === 'true',
    parseFloat(base_salary ?? '0') || 0,
    warehouse_id || null,
    access_expires_at || null,
  ];

  let sql: string;

  if (password && password.trim().length > 0) {
    const hash = await bcrypt.hash(password, 12);
    params.push(hash, id);
    sql = `
      UPDATE users
      SET name=$1, email=$2, role=$3, is_active=$4, base_salary=$5,
          warehouse_id=$6, access_expires_at=$7, password_hash=$8
      WHERE id=$9
    `;
  } else {
    params.push(id);
    sql = `
      UPDATE users
      SET name=$1, email=$2, role=$3, is_active=$4, base_salary=$5,
          warehouse_id=$6, access_expires_at=$7
      WHERE id=$8
    `;
  }

  try {
    await query(sql, params);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { error: 'Email already in use by another user.' };
    }
    return { error: 'Failed to update user.' };
  }

  redirect('/sa-console-x7k2/users');
}

// ── Delete User ──────────────────────────────────────────────────────────────

export async function deleteUserAction(
  _prevState: UserFormState | null,
  formData: FormData
): Promise<UserFormState> {
  await requireSA();

  const id = formData.get('id') as string;
  if (!id) return { error: 'User ID is missing.' };

  try {
    await query('DELETE FROM users WHERE id = $1', [id]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // FK violation — user is referenced elsewhere (audit log, invoices, etc.)
    if (msg.includes('foreign key') || msg.includes('violates')) {
      return { error: 'Cannot delete: user is referenced by existing records. Deactivate instead.' };
    }
    return { error: 'Failed to delete user.' };
  }

  redirect('/sa-console-x7k2/users');
}
