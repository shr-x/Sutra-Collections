'use server';

import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

export async function markTourCompletedAction(): Promise<void> {
  try {
    const session = await requireRole('admin');
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, 'true')
       ON CONFLICT (key) DO UPDATE SET value = 'true'`,
      [`user_${session.userId}_tour_completed`]
    );
  } catch {
    // Non-fatal — localStorage is the primary source of truth
  }
}
