'use server';

import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const StockAdjustSchema = z.object({
  item_id: z.string().uuid('Invalid item'),
  warehouse_id: z.string().uuid('Invalid warehouse'),
  quantity: z.coerce.number().int('Quantity must be a whole number').refine((n) => n !== 0, {
    message: 'Quantity cannot be zero',
  }),
  reason: z.string().optional(),
});

export interface StockAdjustState {
  error?: string;
  success?: string;
}

export async function stockAdjustAction(
  _prevState: StockAdjustState | null,
  formData: FormData
): Promise<StockAdjustState> {
  const sa = await requireSA();

  const parsed = StockAdjustSchema.safeParse({
    item_id: formData.get('item_id'),
    warehouse_id: formData.get('warehouse_id'),
    quantity: formData.get('quantity'),
    reason: formData.get('reason') || '',
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const { item_id, warehouse_id, quantity, reason } = parsed.data;

  // Record adjustment
  await query(
    `INSERT INTO sa_stock_adjustments (item_id, warehouse_id, quantity, reason, adjusted_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [item_id, warehouse_id, quantity, reason ?? null, sa.saUsername]
  );

  // Update stock table safely: find the "base" row (no size/color/variant) for this item+warehouse
  // and update in place, or insert if it doesn't exist.
  const existing = await query<{ id: string }>(
    `SELECT id FROM stock
     WHERE item_id = $1
       AND warehouse_id = $2
       AND variant_id IS NULL
       AND size_id IS NULL
       AND color_id IS NULL
     LIMIT 1`,
    [item_id, warehouse_id]
  );

  if (existing.rows[0]) {
    await query(
      'UPDATE stock SET quantity = GREATEST(0, quantity + $1) WHERE id = $2',
      [quantity, existing.rows[0].id]
    );
  } else {
    // Only insert a new row if we are adding stock (positive quantity)
    if (quantity > 0) {
      await query(
        `INSERT INTO stock (item_id, warehouse_id, quantity)
         VALUES ($1, $2, $3)`,
        [item_id, warehouse_id, quantity]
      );
    } else {
      return { error: 'No stock row found for this item/warehouse combination. Cannot remove stock that does not exist.' };
    }
  }

  redirect('/sa-console-x7k2/stock?adjusted=1');
}
