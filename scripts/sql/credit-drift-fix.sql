-- PROPOSED correction — review before running. NOT run anywhere by Claude.
-- Sets tailoring_orders.credit_amount to the real balance (same rule as
-- lib/tailoring-credit.ts) for orders delivered on credit. Touches only that
-- one column, only on rows that differ. No invoices, payments or journal rows
-- change. Take a pg_dump first.
--
-- It ENDS IN ROLLBACK so a first run is a dry run: it prints every change.
-- When the output looks right, change the last line to COMMIT and run again.
--
--   psql "$DATABASE_URL" -f scripts/sql/credit-drift-fix.sql
BEGIN;

CREATE TEMP TABLE credit_fix ON COMMIT DROP AS
SELECT o.id, o.order_number, o.credit_amount AS old_credit,
       GREATEST(0, ROUND((
         CASE
           WHEN o.invoice_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM tailoring_orders s WHERE s.invoice_id = o.invoice_id AND s.id <> o.id)
             THEN COALESCE((SELECT SUM(i.grand_total - i.amount_paid) FROM invoices i
                            WHERE (i.id = o.invoice_id OR i.supplementary_of_invoice_id = o.invoice_id)
                              AND i.status NOT IN ('cancelled','draft')), 0)
           ELSE o.total_amount - o.amount_paid
         END)::numeric, 2)) AS new_credit
FROM tailoring_orders o
WHERE o.credited_at IS NOT NULL;

DELETE FROM credit_fix WHERE old_credit IS NOT DISTINCT FROM new_credit;

SELECT order_number, old_credit, new_credit FROM credit_fix ORDER BY order_number;

UPDATE tailoring_orders o SET credit_amount = f.new_credit
FROM credit_fix f WHERE o.id = f.id;

SELECT COUNT(*) AS orders_corrected FROM credit_fix;

ROLLBACK;  -- change to COMMIT after reviewing the dry run
