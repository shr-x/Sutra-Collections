-- ─────────────────────────────────────────────────────────────────────────────
-- 011_missing_fk_indexes.sql
--
-- Pre-production schema audit found 71 FK columns with no index. Most are
-- low-traffic audit-trail columns (created_by, recorded_by, etc.) that don't
-- warrant one yet. This migration adds indexes only for the columns that are
-- genuinely hot-path:
--   - warehouse_id on every warehouse-scoped table: Staff accounts are tied to
--     ONE warehouse (see CLAUDE.md) and every list/report page for a Staff
--     user filters `WHERE warehouse_id = $staffWarehouseId` — this runs on
--     nearly every page load for the Staff role.
--   - item_id/variant_id on transaction line-item tables: joined constantly by
--     stock/sales/purchase reports and the Outstanding Dues / best-sellers /
--     inventory-consistency queries.
--
-- Purely additive (CREATE INDEX IF NOT EXISTS only, no rows touched), so no
-- inbound-FK review is needed. All columns verified to exist via
-- information_schema before writing this file.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── warehouse_id (staff warehouse-scoping hot path) ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_warehouse_id      ON tailoring_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_invoices_warehouse_id              ON invoices(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_warehouse_id     ON purchase_invoices(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_quotations_warehouse_id            ON quotations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_warehouse_id       ON purchase_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_goods_received_notes_warehouse_id  ON goods_received_notes(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sa_stock_adjustments_warehouse_id  ON sa_stock_adjustments(warehouse_id);

-- ── item_id / variant_id on transaction line tables (reports/stock hot path) ─
CREATE INDEX IF NOT EXISTS idx_invoice_items_item_id              ON invoice_items(item_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_variant_id           ON invoice_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_item_id     ON purchase_invoice_items(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_variant_id  ON purchase_invoice_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_id         ON stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_items_item_id          ON credit_note_items(item_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_items_variant_id       ON credit_note_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_debit_note_items_item_id           ON debit_note_items(item_id);
CREATE INDEX IF NOT EXISTS idx_debit_note_items_variant_id        ON debit_note_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_item_id            ON quotation_items(item_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_variant_id         ON quotation_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_id       ON purchase_order_items(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_variant_id    ON purchase_order_items(variant_id);

-- ── design_id (Design Catalog / tailoring reports hot path) ──────────────────
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_design_id         ON tailoring_orders(design_id);
