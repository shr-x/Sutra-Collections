'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

const ItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  hsn_code: z
    .string()
    .min(4, 'HSN code must be at least 4 characters')
    .max(10)
    .regex(/^\d+$/, 'HSN code must be numeric')
    .optional()
    .or(z.literal('')),
  category_id: z.string().uuid().nullable().optional(),
  gst_rate: z.coerce.number().min(0, 'GST rate must be 0 or above').max(100, 'GST rate cannot exceed 100'),
  unit: z.string().min(1, 'Unit is required').max(20),
  sale_price: z.coerce.number().min(0).nullable().optional(),
  low_stock_threshold: z.coerce.number().min(0).nullable().optional(),
  is_active: z.boolean().default(true),
});

export interface ItemState { error?: string }

function parseItem(formData: FormData) {
  const threshold = formData.get('low_stock_threshold');
  const salePrice = formData.get('sale_price');
  const categoryId = (formData.get('category_id') as string | null) || null;
  return {
    name: formData.get('name'),
    hsn_code: (formData.get('hsn_code') as string | null) || '',
    category_id: categoryId || null,
    gst_rate: formData.get('gst_rate'),
    unit: (formData.get('unit') as string | null) || '',
    sale_price: salePrice ? salePrice : null,
    low_stock_threshold: threshold ? threshold : null,
    is_active: formData.get('is_active') === 'on',
  };
}

async function resolveItemType(categoryId: string | null | undefined): Promise<'finished' | 'raw_material'> {
  if (!categoryId) return 'finished';
  const catRes = await query<{ item_type: string }>('SELECT item_type FROM item_categories WHERE id=$1', [categoryId]);
  return (catRes.rows[0]?.item_type as 'finished' | 'raw_material') ?? 'finished';
}

export async function createItemAction(
  _prev: ItemState | null,
  formData: FormData
): Promise<ItemState> {
  const session = await requireRole('admin');
  const parsed = ItemSchema.safeParse(parseItem(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;

  if (!d.unit) return { error: 'Unit is required' };
  if (!d.category_id) return { error: 'Category is required' };

  const itemType = await resolveItemType(d.category_id);

  try {
    const res = await query<{ id: string }>(
      `INSERT INTO items (name, hsn_code, item_type, category_id, gst_rate, unit, sale_price, low_stock_threshold, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [d.name, d.hsn_code || null, itemType, d.category_id ?? null, d.gst_rate, d.unit, d.sale_price ?? null, d.low_stock_threshold ?? null, d.is_active]
    );
    const newId = res.rows[0].id;
    // Seed default size and color for every new item
    await Promise.all([
      query('INSERT INTO item_sizes (item_id, size_name, is_default, sort_order) VALUES ($1,$2,true,0)', [newId, 'Regular']),
      query('INSERT INTO item_colors (item_id, color_name, is_default, sort_order) VALUES ($1,$2,true,0)', [newId, 'None']),
    ]);
    logAudit({ userId: session.userId, action: 'create', entityType: 'item', entityId: newId, entityLabel: d.name }).catch(() => {});
    revalidatePath('/inventory/items');
  } catch (err) {
    console.error(err);
    return { error: 'Failed to create item.' };
  }
  redirect('/inventory/items');
}

export async function updateItemAction(
  id: string,
  _prev: ItemState | null,
  formData: FormData
): Promise<ItemState> {
  const session = await requireRole('admin');
  const parsed = ItemSchema.safeParse(parseItem(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;

  if (!d.unit) return { error: 'Unit is required' };

  const itemType = await resolveItemType(d.category_id);

  try {
    await query(
      `UPDATE items SET name=$1, hsn_code=$2, item_type=$3, category_id=$4, gst_rate=$5, unit=$6,
       sale_price=$7, low_stock_threshold=$8, is_active=$9 WHERE id=$10`,
      [d.name, d.hsn_code || null, itemType, d.category_id ?? null, d.gst_rate, d.unit, d.sale_price ?? null, d.low_stock_threshold ?? null, d.is_active, id]
    );
    logAudit({ userId: session.userId, action: 'update', entityType: 'item', entityId: id, entityLabel: d.name }).catch(() => {});
    revalidatePath('/inventory/items');
    revalidatePath(`/inventory/items/${id}`);
  } catch (err) {
    console.error(err);
    return { error: 'Failed to update item.' };
  }
  redirect(`/inventory/items/${id}`);
}

export async function deleteItemAction(formData: FormData) {
  await requireRole('admin');
  const id = formData.get('id') as string;
  if (!id) return;

  // Guard: never delete an item that still has stock on hand (#8)
  const stk = await query<{ q: string }>(`SELECT COALESCE(SUM(quantity),0) AS q FROM stock WHERE item_id=$1`, [id]);
  if (Number(stk.rows[0]?.q ?? 0) > 0) {
    revalidatePath('/inventory/items');
    return;
  }

  try {
    // Remove zero-qty stock rows (FK is ON DELETE RESTRICT), then the item.
    await query('DELETE FROM stock WHERE item_id=$1', [id]);
    await query('DELETE FROM items WHERE id=$1', [id]); // item_sizes/colors cascade
  } catch (err) {
    // Item is referenced by invoices/purchases (FK) → deactivate instead of hard delete.
    console.error('[deleteItemAction] hard delete blocked, deactivating:', err);
    await query('UPDATE items SET is_active=false WHERE id=$1', [id]).catch(() => {});
  }
  revalidatePath('/inventory/items');
  redirect('/inventory/items');
}

export async function toggleItemActiveAction(formData: FormData) {
  const session = await requireRole('admin');
  const id = formData.get('id') as string;
  if (!id) return;
  const is_active = formData.get('is_active') === 'true';
  const nameRes = await query<{ name: string }>('SELECT name FROM items WHERE id=$1', [id]);
  await query('UPDATE items SET is_active=$1 WHERE id=$2', [!is_active, id]);
  logAudit({ userId: session.userId, action: 'update', entityType: 'item', entityId: id, entityLabel: nameRes.rows[0]?.name, newValue: { is_active: !is_active } }).catch(() => {});
  revalidatePath('/inventory/items');
  revalidatePath(`/inventory/items/${id}`);
}
