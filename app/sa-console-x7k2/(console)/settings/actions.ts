'use server';
import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export interface SettingsState { error?: string; success?: boolean }

export async function saveSASettingsAction(
  _prev: SettingsState | null,
  formData: FormData
): Promise<SettingsState> {
  await requireSA();
  const entries = Array.from(formData.entries());
  for (const [key, val] of entries) {
    if (typeof val !== 'string') continue;
    await query(
      `INSERT INTO settings (key, value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [key, val]
    );
  }
  revalidatePath('/sa-console-x7k2/settings');
  return { success: true };
}
