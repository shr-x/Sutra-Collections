/**
 * Which size/colour a stock row counts under, for READ paths (picker, variant
 * availability). Legacy rows with NULL size_id/color_id are attributed to the
 * item's default option, or — when the item has no default (e.g. products
 * created through the purchase form's "new product" flow before Oct 2026) —
 * its first option by sort order. Same choice lib/stock-variant.ts makes when
 * writing, so reads and writes agree and every unit of stock is shown under
 * exactly one variant (variants always add up to the item total).
 *
 * `st` is the stock alias, `itemId` an SQL expression for the item id.
 */
export const effectiveSizeSql = (st: string, itemId: string) =>
  `COALESCE(${st}.size_id, (SELECT id FROM item_sizes WHERE item_id = ${itemId} ORDER BY is_default DESC, sort_order, size_name LIMIT 1))`;

export const effectiveColorSql = (st: string, itemId: string) =>
  `COALESCE(${st}.color_id, (SELECT id FROM item_colors WHERE item_id = ${itemId} ORDER BY is_default DESC, sort_order, color_name LIMIT 1))`;
