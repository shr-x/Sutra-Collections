'use server';

import fs from 'fs';
import path from 'path';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

export interface BusinessFormState {
  success?: boolean;
  error?: string;
}

export async function saveBusinessSettingsAction(
  _prev: BusinessFormState,
  formData: FormData
): Promise<BusinessFormState> {
  await requireRole('admin');

  const fields: Record<string, string> = {
    company_name:          (formData.get('company_name') as string | null) ?? '',
    company_gstin:         (formData.get('company_gstin') as string | null) ?? '',
    company_address:       (formData.get('company_address') as string | null) ?? '',
    company_state:         (formData.get('company_state') as string | null) ?? '',
    company_state_code:    (formData.get('company_state_code') as string | null) ?? '',
    company_phone:         (formData.get('company_phone') as string | null) ?? '',
    company_email:         (formData.get('company_email') as string | null) ?? '',
    upi_vpa:               (formData.get('upi_vpa') as string | null) ?? '',
    loyalty_earn_rate:     (formData.get('loyalty_earn_rate') as string | null) ?? '1',
    loyalty_redemption_rate: (formData.get('loyalty_redemption_rate') as string | null) ?? '10',
    shop_anniversary_date: (formData.get('shop_anniversary_date') as string | null) ?? '',
    terms_and_conditions: (formData.get('terms_and_conditions') as string | null) ?? '',
  };

  // Handle logo upload
  const logoFile = formData.get('logo') as File | null;
  if (logoFile && logoFile.size > 0) {
    if (logoFile.size > 2 * 1024 * 1024) {
      return { error: 'Logo file must be under 2 MB.' };
    }
    const ext = logoFile.name.split('.').pop()?.toLowerCase();
    if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext ?? '')) {
      return { error: 'Logo must be a PNG, JPG, GIF or WebP image.' };
    }
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const destPath = path.join(uploadsDir, `logo.${ext}`);
    const buffer   = Buffer.from(await logoFile.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    fields.company_logo_path = `uploads/logo.${ext}`;
  }

  // Upsert each setting
  const entries = Object.entries(fields);
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }

  return { success: true };
}
