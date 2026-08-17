-- ─────────────────────────────────────────────────────────────────────────────
-- 012_backfill_stock_size_id.sql
--
-- Root cause: the AI-import → purchase-invoice flow could create `stock` rows
-- with size_id left NULL (color_id sometimes resolved, sometimes also NULL),
-- because a mismatched/unextracted size or colour was silently submitted as
-- NULL instead of falling back to the item's variant. Fixed at the source in
-- createPurchaseInvoiceAction (app/(auth)/billing/purchases/actions.ts), which
-- now always resolves size_id/color_id to the item's default (or sole) variant
-- before writing purchase_invoice_items / stock.
--
-- This migration backfills the safe subset of existing corrupted rows: stock
-- rows that already have a resolved color_id but a NULL size_id, for items
-- that have exactly one item_sizes row (i.e. there is no real ambiguity about
-- which size the quantity belongs to).
--
-- Deliberately NOT touched: rows with BOTH size_id and color_id NULL. For
-- items with multiple colours, we cannot know from the data alone which
-- colour that quantity belongs to (e.g. a single lump "unresolved" purchase
-- line across several possible colours) — backfilling those requires manual
-- reconciliation against the original supplier bill via Inventory > Stock,
-- not an automated guess. See project memory for the reconciliation note.
--
-- Idempotent: re-running is a no-op once size_id is backfilled (the WHERE
-- clause only matches rows still missing it).
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE stock s
SET size_id = only_size.id
FROM (
  SELECT item_id, id
  FROM item_sizes iz
  WHERE (SELECT COUNT(*) FROM item_sizes iz2 WHERE iz2.item_id = iz.item_id) = 1
) only_size
WHERE s.item_id = only_size.item_id
  AND s.size_id IS NULL
  AND s.color_id IS NOT NULL;
