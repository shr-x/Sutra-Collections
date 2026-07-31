'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool, query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import type { ActionResult } from '@/types';

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

  const res = await query<{ id: string }>(
    `INSERT INTO discount_schemes (name, scheme_type, buy_item_id, buy_quantity, get_item_id, get_quantity, discount_value, min_order_value, valid_from, valid_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [d.name, d.scheme_type, d.buy_item_id ?? null, d.buy_quantity ?? null,
     d.get_item_id ?? null, d.get_quantity ?? null, d.discount_value ?? null,
     d.min_order_value ?? null, d.valid_from ?? null, d.valid_until ?? null]
  );

  await saveSchemeScope(res.rows[0].id, formData.getAll('item_ids') as string[], formData.getAll('category_ids') as string[]);

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

  await query(
    `UPDATE discount_schemes SET name=$1, scheme_type=$2, buy_item_id=$3, buy_quantity=$4, get_item_id=$5, get_quantity=$6, discount_value=$7, min_order_value=$8, valid_from=$9, valid_until=$10 WHERE id=$11`,
    [d.name, d.scheme_type, d.buy_item_id ?? null, d.buy_quantity ?? null,
     d.get_item_id ?? null, d.get_quantity ?? null, d.discount_value ?? null,
     d.min_order_value ?? null, d.valid_from ?? null, d.valid_until ?? null, id]
  );

  await saveSchemeScope(id, formData.getAll('item_ids') as string[], formData.getAll('category_ids') as string[]);

  redirect('/settings/schemes');
}

export async function toggleSchemeAction(id: string, _fd?: FormData): Promise<void> {
  await requireRole('admin');
  await query('UPDATE discount_schemes SET is_active = NOT is_active WHERE id=$1', [id]);
  redirect('/settings/schemes');
}
