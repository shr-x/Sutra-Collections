import { query } from '@/lib/db';

// Persisted collapsed state for the Production Board's customer groups.
// A row in production_board_collapsed means "this customer's group is collapsed
// in this column for this user"; no row means expanded (the default).
// Keyed per column so a customer's collapsed state never carries over when
// their orders move between columns.

export const PRODUCTION_COLUMN_KEYS = [
  'unassigned',
  'in_production',
  'ready_for_pickup',
  'delivered',
] as const;

export type ProductionColumnKey = (typeof PRODUCTION_COLUMN_KEYS)[number];

export type CollapsedByColumn = Record<ProductionColumnKey, string[]>;

function emptyByColumn(): CollapsedByColumn {
  return { unassigned: [], in_production: [], ready_for_pickup: [], delivered: [] };
}

/**
 * Loads the user's saved collapsed groups for every column.
 *
 * `present` lists the (column, customer) groups currently on the board. Any
 * saved row whose group is no longer in that column (e.g. the customer's
 * orders all moved on) is pruned, so if they come back to that column later
 * they start expanded rather than silently re-collapsing.
 *
 * Never throws: on failure the board falls back to all groups expanded.
 */
export async function loadCollapsedGroups(
  userId: string,
  present: { column: ProductionColumnKey; customerId: string }[],
): Promise<CollapsedByColumn> {
  const result = emptyByColumn();
  try {
    await query(
      `DELETE FROM production_board_collapsed
        WHERE user_id = $1
          AND (column_key, customer_id) NOT IN (
            SELECT * FROM unnest($2::text[], $3::uuid[])
          )`,
      [userId, present.map((p) => p.column), present.map((p) => p.customerId)],
    );

    const { rows } = await query<{ column_key: ProductionColumnKey; customer_id: string }>(
      `SELECT column_key, customer_id::text AS customer_id
         FROM production_board_collapsed
        WHERE user_id = $1`,
      [userId],
    );
    for (const row of rows) {
      result[row.column_key].push(row.customer_id);
    }
  } catch (err) {
    console.error('[production-board] failed to load collapsed groups:', err);
    return emptyByColumn();
  }
  return result;
}

/**
 * Saves (collapsed = true) or clears (collapsed = false) one group's state.
 * Idempotent: repeating the same call is harmless.
 */
export async function setGroupCollapsed(
  userId: string,
  column: ProductionColumnKey,
  customerId: string,
  collapsed: boolean,
): Promise<void> {
  if (collapsed) {
    await query(
      `INSERT INTO production_board_collapsed (user_id, column_key, customer_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, column_key, customer_id) DO NOTHING`,
      [userId, column, customerId],
    );
  } else {
    await query(
      `DELETE FROM production_board_collapsed
        WHERE user_id = $1 AND column_key = $2 AND customer_id = $3`,
      [userId, column, customerId],
    );
  }
}
