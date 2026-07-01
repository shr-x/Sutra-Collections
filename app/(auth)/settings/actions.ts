'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function togglePurchaseOrdersAction(formData: FormData) {
  const session = await requireRole('admin');
  const enabled = formData.get('purchase_orders_enabled') === 'on';
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('purchase_orders_enabled', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [enabled ? 'true' : 'false']
  );
  logAudit({ userId: session.userId, action: 'update', entityType: 'setting', entityId: 'purchase_orders_enabled', entityLabel: 'Purchase Orders', newValue: { enabled } }).catch(() => {});
  revalidatePath('/settings');
}

export interface SettingsSaveResult { success: boolean; error?: string }

/** Save WhatsApp & notification settings (reminder cadence, admin phone). */
export async function saveWhatsAppSettingsAction(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  try {
    const session = await requireRole('admin');
    const before   = Math.max(0, parseInt(formData.get('reminder_days_before') as string) || 3);
    const interval = Math.max(1, parseInt(formData.get('overdue_reminder_interval') as string) || 1);
    const adminWa  = (formData.get('admin_whatsapp') as string ?? '').trim();

    const upsert = (key: string, value: string) =>
      query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      );

    await Promise.all([
      upsert('reminder_days_before',      String(before)),
      upsert('overdue_reminder_interval', String(interval)),
      upsert('admin_whatsapp',            adminWa),
    ]);
    logAudit({ userId: session.userId, action: 'update', entityType: 'setting', entityId: 'whatsapp_settings', entityLabel: 'WhatsApp Settings' }).catch(() => {});
    revalidatePath('/settings');
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

/** @deprecated Use saveWhatsAppSettingsAction */
export async function saveReminderConfigAction(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  return saveWhatsAppSettingsAction(_prev, formData);
}

export async function saveLowStockThresholdAction(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  try {
    const session = await requireRole('admin');
    const threshold = Math.max(0, parseInt(formData.get('low_stock_threshold') as string) || 0);
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('low_stock_threshold', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [String(threshold)]
    );
    logAudit({ userId: session.userId, action: 'update', entityType: 'setting', entityId: 'low_stock_threshold', entityLabel: 'Low Stock Threshold', newValue: { threshold } }).catch(() => {});
    revalidatePath('/settings');
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

export async function toggleStaffModuleAction(formData: FormData) {
  const session = await requireRole('admin');
  const enabled = formData.get('staff_module_enabled') === 'on';
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('staff_module_enabled', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [enabled ? 'true' : 'false']
  );
  logAudit({ userId: session.userId, action: 'update', entityType: 'setting', entityId: 'staff_module_enabled', entityLabel: 'Staff Module', newValue: { enabled } }).catch(() => {});
  revalidatePath('/settings');
  revalidatePath('/');
}

