import { pool } from '@/lib/db';

/**
 * Deletes one size or colour of an item, safely:
 *  - blocked if ANY stock row references it, whatever the quantity (zero and
 *    negative included) — otherwise the FK's ON DELETE SET NULL would orphan
 *    that stock row from every size/colour view;
 *  - blocked if it's the item's last remaining size/colour (every stock write
 *    needs one — lib/stock-variant.ts);
 *  - if it was the default, the next option (by sort_order) becomes default.
 * The checks and the delete run in one transaction with the item's options
 * locked, so a concurrent stock write or delete can't slip in between.
 */
export async function deleteItemVariant(
  kind: 'size' | 'color',
  itemId: string,
  variantId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const table = kind === 'size' ? 'item_sizes' : 'item_colors';
  const col = kind === 'size' ? 'size_id' : 'color_id';
  const label = kind === 'size' ? 'size' : 'colour';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const opts = await client.query<{ id: string; is_default: boolean }>(
      `SELECT id, is_default FROM ${table} WHERE item_id=$1 ORDER BY sort_order FOR UPDATE`, [itemId]
    );
    const target = opts.rows.find((r) => r.id === variantId);
    if (!target) { await client.query('ROLLBACK'); return { ok: false, status: 404, error: `That ${label} doesn't exist on this item.` }; }

    if (opts.rows.length <= 1) {
      await client.query('ROLLBACK');
      return { ok: false, status: 409, error: `Can't delete the item's last ${label}. Every item needs at least one ${label}.` };
    }

    const stock = await client.query<{ n: string; qty: string; wh: string }>(
      `SELECT COUNT(*)::text AS n, COALESCE(SUM(quantity),0)::text AS qty, COUNT(DISTINCT warehouse_id)::text AS wh
       FROM stock WHERE ${col}=$1`, [variantId]
    );
    if (Number(stock.rows[0].n) > 0) {
      await client.query('ROLLBACK');
      return {
        ok: false, status: 409,
        error: `Can't delete this ${label}: ${stock.rows[0].n} stock record(s) in ${stock.rows[0].wh} warehouse(s) use it ` +
               `(total quantity ${Number(stock.rows[0].qty)}). Records at zero quantity count too.`,
      };
    }

    await client.query(`DELETE FROM ${table} WHERE id=$1 AND item_id=$2`, [variantId, itemId]);
    if (target.is_default) {
      const next = opts.rows.find((r) => r.id !== variantId)!;
      await client.query(`UPDATE ${table} SET is_default=TRUE WHERE id=$1`, [next.id]);
    }
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
