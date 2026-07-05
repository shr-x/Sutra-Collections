'use server';
import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export interface ItemState { error?: string }

const ItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category_id: z.string().uuid().optional().or(z.literal('')),
  item_type: z.enum(['finished', 'raw_material']).default('finished'),
  unit: z.string().optional(),
  hsn_code: z.string().optional(),
  gst_rate: z.coerce.number().min(0).max(28).default(0),
  is_active: z.boolean().default(true),
});

export async function createSAItemAction(
  _prev: ItemState | null,
  formData: FormData
): Promise<ItemState> {
  await requireSA();
  const raw = {
    ...Object.fromEntries(formData),
    is_active: formData.get('is_active') === 'on',
  };
  const parsed = ItemSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;

  const dupCheck = await query<{ id: string }>(
    `SELECT id FROM items WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
    [d.name]
  );
  if (dupCheck.rows.length > 0) {
    return { error: `An item named "${d.name}" already exists.` };
  }

  const res = await query<{ id: string }>(
    `INSERT INTO items (name, category_id, item_type, unit, hsn_code, gst_rate, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [d.name, d.category_id || null, d.item_type, d.unit || null, d.hsn_code || null, d.gst_rate, d.is_active]
  );
  const newId = res.rows[0].id;
  await Promise.all([
    query('INSERT INTO item_sizes (item_id, size_name, is_default, sort_order) VALUES ($1,$2,true,0)', [newId, 'Regular']),
    query('INSERT INTO item_colors (item_id, color_name, is_default, sort_order) VALUES ($1,$2,true,0)', [newId, 'Default']),
  ]);
  redirect('/sa-console-x7k2/items');
}

export async function updateSAItemAction(
  _prev: ItemState | null,
  formData: FormData
): Promise<ItemState> {
  await requireSA();
  const id = formData.get('id') as string;
  if (!id) return { error: 'Item ID missing.' };
  const raw = {
    ...Object.fromEntries(formData),
    is_active: formData.get('is_active') === 'on',
  };
  const parsed = ItemSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  await query(
    `UPDATE items SET name=$1, category_id=$2, item_type=$3, unit=$4, hsn_code=$5, gst_rate=$6, is_active=$7
     WHERE id=$8`,
    [d.name, d.category_id || null, d.item_type, d.unit || null, d.hsn_code || null, d.gst_rate, d.is_active, id]
  );
  redirect('/sa-console-x7k2/items');
}

export async function toggleSAItemActiveAction(formData: FormData) {
  await requireSA();
  const id = formData.get('id') as string;
  await query(`UPDATE items SET is_active = NOT is_active WHERE id=$1`, [id]);
  revalidatePath('/sa-console-x7k2/items');
}
