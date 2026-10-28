import type { QueryResultRow } from 'pg';

// Any of: the module-level `query()` from lib/db, a pg PoolClient/Pool, or a
// transaction client — all expose this same call signature.
interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
}

/**
 * Thrown when a stock write can't be tied to a real size/colour. Callers catch
 * it and show `message` to the user instead of silently writing NULL
 * size_id/color_id (which orphans stock from every variant view).
 */
export class StockVariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockVariantError';
  }
}

// Root-cause resolver for stock.size_id/color_id, generalized from the fix
// originally applied to purchase invoices (app/(auth)/billing/purchases/actions.ts).
// Every item is guaranteed at least one item_sizes and one item_colors row
// (created alongside the item — see app/(auth)/inventory/items/actions.ts,
// app/api/items/quick-create and migration 020), so a stock write must never
// persist NULL. When an item has exactly one size/color option this is
// unambiguous. When it has more than one, we still pick a value (preferring
// is_default, else the first by sort_order) — but log it so an arbitrary pick
// among several options can be reviewed. If the item has NO option, or the
// caller passed an id that doesn't belong to the item, this throws
// StockVariantError rather than writing NULL.
async function resolveOne(
  db: Queryable,
  table: 'item_sizes' | 'item_colors',
  itemId: string,
  provided: string | null,
  kind: 'size' | 'color'
): Promise<string> {
  const label = kind === 'size' ? 'size' : 'colour';
  if (provided) {
    const own = await db.query(`SELECT 1 FROM ${table} WHERE id=$1 AND item_id=$2`, [provided, itemId]);
    if (!own.rows.length) {
      throw new StockVariantError(`The selected ${label} doesn't belong to this item. Re-select the item and try again.`);
    }
    return provided;
  }

  const res = await db.query<{ id: string; total: string }>(
    `SELECT id, COUNT(*) OVER() AS total FROM ${table}
     WHERE item_id=$1 ORDER BY is_default DESC, sort_order LIMIT 1`,
    [itemId]
  );
  const row = res.rows[0];
  if (!row) {
    const name = await db.query<{ name: string }>('SELECT name FROM items WHERE id=$1', [itemId]);
    throw new StockVariantError(
      `"${name.rows[0]?.name ?? 'This item'}" has no ${label} set up, so its stock can't be recorded. ` +
      `Add a ${label} to the item (Inventory → Items) and try again.`
    );
  }

  if (Number(row.total) > 1) {
    console.warn(
      `[stock-variant] Ambiguous ${kind} for item ${itemId}: ${row.total} options exist and none ` +
      `was specified. Defaulted to ${row.id} (is_default/first by sort order) — review for accuracy.`
    );
  }
  return row.id;
}

export interface ResolvedVariant {
  sizeId: string;
  colorId: string;
}

export async function resolveStockVariant(
  db: Queryable,
  itemId: string,
  sizeId: string | null | undefined,
  colorId: string | null | undefined
): Promise<ResolvedVariant> {
  const resolvedSizeId = await resolveOne(db, 'item_sizes', itemId, sizeId ?? null, 'size');
  const resolvedColorId = await resolveOne(db, 'item_colors', itemId, colorId ?? null, 'color');
  return { sizeId: resolvedSizeId, colorId: resolvedColorId };
}
