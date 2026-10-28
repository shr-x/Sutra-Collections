-- ─────────────────────────────────────────────────────────────────────────────
-- 020_backfill_default_variants.sql
--
-- Safe, additive stock/variant backfill (Oct 2026). Every stock write now
-- requires a real size AND colour (lib/stock-variant.ts throws otherwise), so:
--
--   1. Items with no size get a default "Regular" size; items with no colour
--      get a default "Default" colour (same names Inventory → New Item and
--      quick-create use, and the ones migration 001 backfilled).
--   2. stock rows with a NULL size_id are linked to the item's size ONLY when
--      the item has exactly one size; same, independently, for color_id.
--   3. Anything ambiguous is reported (RAISE NOTICE → printed by migrate.ts)
--      and NOT touched:
--        - NULL size/colour on an item with several options;
--        - a row that would collide with an existing row for the same
--          item/warehouse/size/colour (fixing it would mean merging
--          quantities, which needs a human).
--
-- No NOT NULL constraints are added. No rows are deleted or merged.
-- Idempotent: the inserts only fire for items still missing an option and the
-- updates only touch rows still NULL, so re-running is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Default options for items that have none.
INSERT INTO item_sizes (item_id, size_name, is_default, sort_order)
SELECT i.id, 'Regular', TRUE, 0
FROM items i
WHERE NOT EXISTS (SELECT 1 FROM item_sizes s WHERE s.item_id = i.id);

INSERT INTO item_colors (item_id, color_name, is_default, sort_order)
SELECT i.id, 'Default', TRUE, 0
FROM items i
WHERE NOT EXISTS (SELECT 1 FROM item_colors c WHERE c.item_id = i.id);

DO $$
DECLARE
  r RECORD;
  n_size INT := 0;
  n_color INT := 0;
  n_ambiguous INT := 0;
BEGIN
  -- 2a. NULL size_id → the item's only size, unless that would collide.
  FOR r IN
    SELECT st.id, st.item_id, st.warehouse_id, st.color_id, only_s.id AS size_id
    FROM stock st
    JOIN LATERAL (
      SELECT MIN(s.id::text)::uuid AS id, COUNT(*) AS n FROM item_sizes s WHERE s.item_id = st.item_id
    ) only_s ON only_s.n = 1
    WHERE st.size_id IS NULL
  LOOP
    IF r.color_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM stock o
      WHERE o.item_id = r.item_id AND o.warehouse_id = r.warehouse_id
        AND o.size_id = r.size_id AND o.color_id = r.color_id AND o.id <> r.id
    ) THEN
      RAISE NOTICE '[020] SKIPPED stock % (item %, warehouse %): linking its size would duplicate an existing row — merge manually.',
        r.id, r.item_id, r.warehouse_id;
      CONTINUE;
    END IF;
    UPDATE stock SET size_id = r.size_id WHERE id = r.id;
    n_size := n_size + 1;
  END LOOP;

  -- 2b. NULL color_id → the item's only colour, unless that would collide.
  FOR r IN
    SELECT st.id, st.item_id, st.warehouse_id, st.size_id, only_c.id AS color_id
    FROM stock st
    JOIN LATERAL (
      SELECT MIN(c.id::text)::uuid AS id, COUNT(*) AS n FROM item_colors c WHERE c.item_id = st.item_id
    ) only_c ON only_c.n = 1
    WHERE st.color_id IS NULL
  LOOP
    IF r.size_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM stock o
      WHERE o.item_id = r.item_id AND o.warehouse_id = r.warehouse_id
        AND o.size_id = r.size_id AND o.color_id = r.color_id AND o.id <> r.id
    ) THEN
      RAISE NOTICE '[020] SKIPPED stock % (item %, warehouse %): linking its colour would duplicate an existing row — merge manually.',
        r.id, r.item_id, r.warehouse_id;
      CONTINUE;
    END IF;
    UPDATE stock SET color_id = r.color_id WHERE id = r.id;
    n_color := n_color + 1;
  END LOOP;

  -- 3. Report what is still unresolved (left untouched on purpose).
  FOR r IN
    SELECT st.id, i.name, st.warehouse_id, st.quantity,
           (st.size_id IS NULL) AS no_size, (st.color_id IS NULL) AS no_color,
           (SELECT COUNT(*) FROM item_sizes s WHERE s.item_id = st.item_id) AS sizes,
           (SELECT COUNT(*) FROM item_colors c WHERE c.item_id = st.item_id) AS colors
    FROM stock st JOIN items i ON i.id = st.item_id
    WHERE st.size_id IS NULL OR st.color_id IS NULL
    ORDER BY i.name
  LOOP
    n_ambiguous := n_ambiguous + 1;
    RAISE NOTICE '[020] AMBIGUOUS stock % — "%" qty % in warehouse %: missing % (item has % size(s), % colour(s)). Not changed.',
      r.id, r.name, r.quantity, r.warehouse_id,
      CASE WHEN r.no_size AND r.no_color THEN 'size+colour' WHEN r.no_size THEN 'size' ELSE 'colour' END,
      r.sizes, r.colors;
  END LOOP;

  RAISE NOTICE '[020] linked % size(s), % colour(s); % stock row(s) left ambiguous.', n_size, n_color, n_ambiguous;
END $$;
