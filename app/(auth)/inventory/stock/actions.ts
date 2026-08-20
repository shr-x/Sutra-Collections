'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { resolveStockVariant } from '@/lib/stock-variant';

const IN_TYPES = ['purchase', 'adjustment_in'] as const;
const OUT_TYPES = ['sale', 'adjustment_out'] as const;
const ALL_TYPES = [...IN_TYPES, ...OUT_TYPES, 'transfer'] as const;

const MovementSchema = z.object({
  item_id: z.string().uuid('Select an item'),
  variant_id: z.string().uuid().optional().or(z.literal('')),
  warehouse_id: z.string().uuid('Select a warehouse'),
  to_warehouse_id: z.string().uuid().optional().or(z.literal('')),
  movement_type: z.enum(ALL_TYPES, { message: 'Select movement type' }),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  reason: z.string().max(500).optional(),
});

export interface MovementState { error?: string; success?: boolean }

export async function createStockMovementAction(
  _prev: MovementState | null,
  formData: FormData
): Promise<MovementState> {
  const session = await requireRole('admin');

  const parsed = MovementSchema.safeParse({
    item_id: formData.get('item_id'),
    variant_id: formData.get('variant_id') || '',
    warehouse_id: formData.get('warehouse_id'),
    to_warehouse_id: formData.get('to_warehouse_id') || '',
    movement_type: formData.get('movement_type'),
    quantity: formData.get('quantity'),
    reason: formData.get('reason') || undefined,
  });

  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const d = parsed.data;
  const variantId = d.variant_id || null;
  const isIn = (IN_TYPES as readonly string[]).includes(d.movement_type);
  const isTransfer = d.movement_type === 'transfer';

  const client = await (await import('@/lib/db')).default.connect();
  try {
    await client.query('BEGIN');

    // Root-cause fix: this form has no size/color picker (only the legacy,
    // now-empty item_variants dropdown), so every movement used to match/
    // upsert stock purely on variant_id. Postgres never considers two rows
    // "conflicting" on a plain UNIQUE constraint when the constrained column
    // is NULL, so with variant_id always NULL here, the ON CONFLICT below
    // never actually matched an existing row — every movement silently
    // INSERTed a brand-new stock row instead of updating the item's real one.
    // Resolve to the item's actual size/color (single option, or is_default/
    // first if several) and match/upsert on that instead, same as every
    // other write path.
    const { sizeId, colorId } = await resolveStockVariant(client, d.item_id, null, null);

    if (isTransfer) {
      if (!d.to_warehouse_id) {
        await client.query('ROLLBACK');
        return { error: 'Select a destination warehouse for transfer.' };
      }
      if (d.to_warehouse_id === d.warehouse_id) {
        await client.query('ROLLBACK');
        return { error: 'Source and destination warehouses must be different.' };
      }

      // Check source stock
      const { rows } = await client.query(
        `SELECT quantity FROM stock WHERE item_id=$1 AND warehouse_id=$2
         AND size_id IS NOT DISTINCT FROM $3::uuid AND color_id IS NOT DISTINCT FROM $4::uuid`,
        [d.item_id, d.warehouse_id, sizeId, colorId]
      );
      const available = Number(rows[0]?.quantity ?? 0);
      if (available < d.quantity) {
        await client.query('ROLLBACK');
        return { error: `Insufficient stock. Available: ${available}` };
      }

      // Deduct from source
      await client.query(
        `UPDATE stock SET quantity = quantity - $1
         WHERE item_id=$2 AND warehouse_id=$3
         AND size_id IS NOT DISTINCT FROM $4::uuid AND color_id IS NOT DISTINCT FROM $5::uuid`,
        [d.quantity, d.item_id, d.warehouse_id, sizeId, colorId]
      );

      // Add to destination (upsert)
      await client.query(
        `INSERT INTO stock (item_id, size_id, color_id, warehouse_id, quantity)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (item_id, warehouse_id, size_id, color_id) WHERE size_id IS NOT NULL AND color_id IS NOT NULL
         DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity`,
        [d.item_id, sizeId, colorId, d.to_warehouse_id, d.quantity]
      );

      // Log transfer_out
      await client.query(
        `INSERT INTO stock_movements (item_id,variant_id,warehouse_id,to_warehouse_id,movement_type,quantity,reason,created_by)
         VALUES ($1,$2,$3,$4,'transfer_out',$5,$6,$7)`,
        [d.item_id, variantId, d.warehouse_id, d.to_warehouse_id, d.quantity, d.reason ?? null, session.userId]
      );
      // Log transfer_in
      await client.query(
        `INSERT INTO stock_movements (item_id,variant_id,warehouse_id,to_warehouse_id,movement_type,quantity,reason,created_by)
         VALUES ($1,$2,$3,$4,'transfer_in',$5,$6,$7)`,
        [d.item_id, variantId, d.to_warehouse_id, d.warehouse_id, d.quantity, d.reason ?? null, session.userId]
      );
    } else {
      if (!isIn) {
        // Check stock before deducting
        const { rows } = await client.query(
          `SELECT quantity FROM stock WHERE item_id=$1 AND warehouse_id=$2
           AND size_id IS NOT DISTINCT FROM $3::uuid AND color_id IS NOT DISTINCT FROM $4::uuid`,
          [d.item_id, d.warehouse_id, sizeId, colorId]
        );
        const available = Number(rows[0]?.quantity ?? 0);
        if (available < d.quantity) {
          await client.query('ROLLBACK');
          return { error: `Insufficient stock. Available: ${available}` };
        }
      }

      const delta = isIn ? d.quantity : -d.quantity;

      await client.query(
        `INSERT INTO stock (item_id, size_id, color_id, warehouse_id, quantity)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (item_id, warehouse_id, size_id, color_id) WHERE size_id IS NOT NULL AND color_id IS NOT NULL
         DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity`,
        [d.item_id, sizeId, colorId, d.warehouse_id, delta]
      );

      await client.query(
        `INSERT INTO stock_movements (item_id,variant_id,warehouse_id,movement_type,quantity,reason,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [d.item_id, variantId, d.warehouse_id, d.movement_type, d.quantity, d.reason ?? null, session.userId]
      );
    }

    await client.query('COMMIT');
    revalidatePath('/inventory/stock');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Stock movement failed:', err);
    return { error: 'Failed to record movement. Please try again.' };
  } finally {
    client.release();
  }
}
