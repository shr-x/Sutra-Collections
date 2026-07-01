'use server';
import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';

export interface ChangePasswordState { error?: string; success?: boolean }

export async function changePasswordAction(
  _prev: ChangePasswordState | null,
  formData: FormData
): Promise<ChangePasswordState> {
  const sa = await requireSA();
  const current = formData.get('current_password') as string;
  const next = formData.get('new_password') as string;
  const confirm = formData.get('confirm_password') as string;

  if (!current || !next || !confirm) return { error: 'All fields are required.' };
  if (next.length < 8) return { error: 'New password must be at least 8 characters.' };
  if (next !== confirm) return { error: 'New passwords do not match.' };

  const res = await query<{ password_hash: string }>(
    'SELECT password_hash FROM super_admins WHERE id=$1', [sa.saId]
  );
  if (!res.rows[0]) return { error: 'Account not found.' };
  const ok = await bcrypt.compare(current, res.rows[0].password_hash);
  if (!ok) return { error: 'Current password is incorrect.' };

  const newHash = await bcrypt.hash(next, 12);
  await query('UPDATE super_admins SET password_hash=$1 WHERE id=$2', [newHash, sa.saId]);
  return { success: true };
}
