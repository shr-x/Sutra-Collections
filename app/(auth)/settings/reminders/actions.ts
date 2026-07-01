'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import type { ActionResult } from '@/types';

const ReminderSchema = z.object({
  day_threshold:    z.coerce.number().int().min(1).max(365),
  tone:             z.enum(['gentle', 'firm', 'final']),
  message_template: z.string().min(10).max(1000),
  is_active:        z.coerce.boolean().default(true),
});

export async function createReminderAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireRole('admin');
  try {
    const parsed = ReminderSchema.parse(Object.fromEntries(formData.entries()));
    await pool.query(
      `INSERT INTO reminder_settings (day_threshold, tone, message_template, is_active)
       VALUES ($1,$2,$3,$4)`,
      [parsed.day_threshold, parsed.tone, parsed.message_template, parsed.is_active]
    );
  } catch (e) {
    return { success: false, error: e instanceof z.ZodError ? e.errors[0].message : 'Failed to create' };
  }
  redirect('/settings/reminders');
}

export async function updateReminderAction(
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireRole('admin');
  try {
    const parsed = ReminderSchema.parse(Object.fromEntries(formData.entries()));
    await pool.query(
      `UPDATE reminder_settings SET day_threshold=$1, tone=$2, message_template=$3, is_active=$4 WHERE id=$5`,
      [parsed.day_threshold, parsed.tone, parsed.message_template, parsed.is_active, id]
    );
  } catch (e) {
    return { success: false, error: e instanceof z.ZodError ? e.errors[0].message : 'Failed to update' };
  }
  redirect('/settings/reminders');
}

export async function deleteReminderAction(id: string, _fd?: FormData): Promise<void> {
  await requireRole('admin');
  await pool.query(`DELETE FROM reminder_settings WHERE id=$1`, [id]);
  redirect('/settings/reminders');
}

export async function toggleReminderAction(id: string, _fd?: FormData): Promise<void> {
  await requireRole('admin');
  await pool.query(`UPDATE reminder_settings SET is_active = NOT is_active WHERE id=$1`, [id]);
  redirect('/settings/reminders');
}
