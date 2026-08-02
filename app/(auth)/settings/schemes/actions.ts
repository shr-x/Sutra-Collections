'use server';

import fs from 'fs';
import path from 'path';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool, query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { broadcastOffer } from '@/lib/offer-broadcast';
import type { ActionResult } from '@/types';

/**
 * Saves an uploaded offer banner to public/uploads/schemes/<id>.<ext> (same
 * storage pattern as design/item photos) and returns the relative path, or null
 * if no file was provided. Returns { error } string on validation failure.
 */
async function saveOfferImage(schemeId: string, formData: FormData): Promise<{ path?: string; error?: string }> {
  const image = formData.get('offer_image') as File | null;
  if (!image || image.size === 0) return {};
  if (image.size > 5 * 1024 * 1024) return { error: 'Offer image must be under 5 MB.' };
  const ext = image.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return { error: 'Offer image must be PNG, JPG, GIF or WebP.' };
  const dir = path.join(process.cwd(), 'public', 'uploads', 'schemes');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from(await image.arrayBuffer());
  fs.writeFileSync(path.join(dir, `${schemeId}.${ext}`), buf);
  return { path: `uploads/schemes/${schemeId}.${ext}` };
}

async function saveSchemeScope(schemeId: string, itemIds: string[], categoryIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM discount_scheme_items WHERE scheme_id=$1', [schemeId]);
    await client.query('DELETE FROM discount_scheme_categories WHERE scheme_id=$1', [schemeId]);
    for (const itemId of itemIds) {
      await client.query('INSERT INTO discount_scheme_items (scheme_id, item_id) VALUES ($1,$2)', [schemeId, itemId]);
    }
    for (const categoryId of categoryIds) {
      await client.query('INSERT INTO discount_scheme_categories (scheme_id, category_id) VALUES ($1,$2)', [schemeId, categoryId]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const SchemeSchema = z.object({
  name: z.string().min(1).max(255),
  scheme_type: z.enum(['buy_x_get_y', 'flat', 'percent', 'seasonal']),
  buy_item_id: z.string().uuid().nullable().optional(),
  buy_quantity: z.coerce.number().positive().nullable().optional(),
  get_item_id: z.string().uuid().nullable().optional(),
  get_quantity: z.coerce.number().positive().nullable().optional(),
  discount_value: z.coerce.number().nonnegative().nullable().optional(),
  min_order_value: z.coerce.number().nonnegative().nullable().optional(),
  valid_from: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
});

export async function createSchemeAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireRole('admin');

  const raw = Object.fromEntries(formData);
  const parsed = SchemeSchema.safeParse({
    ...raw,
    buy_item_id: raw.buy_item_id || null,
    get_item_id: raw.get_item_id || null,
    buy_quantity: raw.buy_quantity || null,
    get_quantity: raw.get_quantity || null,
    discount_value: raw.discount_value || null,
    min_order_value: raw.min_order_value || null,
    valid_from: raw.valid_from || null,
    valid_until: raw.valid_until || null,
  });

  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const d = parsed.data;

  // Draft/Active status → is_active (Draft never broadcasts).
  const isActive = formData.get('status') === 'active';

  const res = await query<{ id: string }>(
    `INSERT INTO discount_schemes (name, scheme_type, buy_item_id, buy_quantity, get_item_id, get_quantity, discount_value, min_order_value, valid_from, valid_until, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [d.name, d.scheme_type, d.buy_item_id ?? null, d.buy_quantity ?? null,
     d.get_item_id ?? null, d.get_quantity ?? null, d.discount_value ?? null,
     d.min_order_value ?? null, d.valid_from ?? null, d.valid_until ?? null, isActive]
  );
  const schemeId = res.rows[0].id;

  await saveSchemeScope(schemeId, formData.getAll('item_ids') as string[], formData.getAll('category_ids') as string[]);

  const img = await saveOfferImage(schemeId, formData);
  if (img.error) return { success: false, error: img.error };
  if (img.path) await query('UPDATE discount_schemes SET offer_image_path=$1 WHERE id=$2', [img.path, schemeId]);

  // Broadcast only when Active AND the broadcast toggle is on (broadcastOffer
  // itself re-checks Active, an image is present, and it hasn't already sent).
  // Detached — the persistent Node server keeps it running past this request.
  if (isActive && formData.get('send_broadcast') === 'on') {
    void broadcastOffer(schemeId);
  }

  redirect(`/settings/schemes`);
}

export async function updateSchemeAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole('admin');

  const raw = Object.fromEntries(formData);
  const parsed = SchemeSchema.safeParse({
    ...raw,
    buy_item_id: raw.buy_item_id || null, get_item_id: raw.get_item_id || null,
    buy_quantity: raw.buy_quantity || null, get_quantity: raw.get_quantity || null,
    discount_value: raw.discount_value || null, min_order_value: raw.min_order_value || null,
    valid_from: raw.valid_from || null, valid_until: raw.valid_until || null,
  });

  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const d = parsed.data;

  const isActive = formData.get('status') === 'active';

  await query(
    `UPDATE discount_schemes SET name=$1, scheme_type=$2, buy_item_id=$3, buy_quantity=$4, get_item_id=$5, get_quantity=$6, discount_value=$7, min_order_value=$8, valid_from=$9, valid_until=$10, is_active=$11 WHERE id=$12`,
    [d.name, d.scheme_type, d.buy_item_id ?? null, d.buy_quantity ?? null,
     d.get_item_id ?? null, d.get_quantity ?? null, d.discount_value ?? null,
     d.min_order_value ?? null, d.valid_from ?? null, d.valid_until ?? null, isActive, id]
  );

  await saveSchemeScope(id, formData.getAll('item_ids') as string[], formData.getAll('category_ids') as string[]);

  const img = await saveOfferImage(id, formData);
  if (img.error) return { success: false, error: img.error };
  if (img.path) await query('UPDATE discount_schemes SET offer_image_path=$1 WHERE id=$2', [img.path, id]);

  // Broadcasts only once (guarded by broadcast_sent_at inside broadcastOffer),
  // so re-saving an already-broadcast scheme won't re-blast all customers.
  if (isActive && formData.get('send_broadcast') === 'on') {
    void broadcastOffer(id);
  }

  redirect('/settings/schemes');
}

export async function toggleSchemeAction(id: string, _fd?: FormData): Promise<void> {
  await requireRole('admin');
  await query('UPDATE discount_schemes SET is_active = NOT is_active WHERE id=$1', [id]);
  redirect('/settings/schemes');
}
