import type { QueryResultRow } from 'pg';

// Any of: the module-level `query()` from lib/db, a pg PoolClient/Pool, or a
// transaction client — all expose this same call signature.
interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
}

export interface ResolvedVariant {
  sizeId: string | null;
  colorId: string | null;
}

// Root-cause resolver for stock.size_id/color_id, generalized from the fix
// originally applied to purchase invoices (app/(auth)/billing/purchases/actions.ts).
// Every item is guaranteed at least one item_sizes and one item_colors row
// (created alongside the item — see app/(auth)/inventory/items/actions.ts),
// so a stock write should never persist NULL just because the caller didn't
// resolve one. When an item has exactly one size/color option this is
// unambiguous. When it has more than one, we still pick a value (preferring
// is_default, else the first by sort_order) rather than leaving the row
// unresolved — but log it clearly so an arbitrary pick among several options
// can be reviewed/reconciled manually instead of silently guessing.
async function resolveOne(
  db: Queryable,
  table: 'item_sizes' | 'item_colors',
  itemId: string,
  provided: string | null,
  kind: 'size' | 'color'
): Promise<string | null> {
  if (provided) return provided;

  const res = await db.query<{ id: string; total: string }>(
    `SELECT id, COUNT(*) OVER() AS total FROM ${table}
     WHERE item_id=$1 ORDER BY is_default DESC, sort_order LIMIT 1`,
    [itemId]
  );
  const row = res.rows[0];
  if (!row) return null; // Should not happen — every item has a default row.

  if (Number(row.total) > 1) {
    console.warn(
      `[stock-variant] Ambiguous ${kind} for item ${itemId}: ${row.total} options exist and none ` +
      `was specified. Defaulted to ${row.id} (is_default/first by sort order) — review for accuracy.`
    );
  }
  return row.id;
}

export async function resolveStockVariant(
  db: Queryable,
  itemId: string,
  sizeId: string | null | undefined,
  colorId: string | null | undefined
): Promise<ResolvedVariant> {
  const [resolvedSizeId, resolvedColorId] = await Promise.all([
    resolveOne(db, 'item_sizes', itemId, sizeId ?? null, 'size'),
    resolveOne(db, 'item_colors', itemId, colorId ?? null, 'color'),
  ]);
  return { sizeId: resolvedSizeId, colorId: resolvedColorId };
}
