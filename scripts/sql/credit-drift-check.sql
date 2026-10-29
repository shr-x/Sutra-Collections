-- READ-ONLY. Lists customers whose stored tailoring credit
-- (SUM tailoring_orders.credit_amount) differs from what they really owe on
-- orders delivered on credit. Safe to run on live: SELECT only.
--
--   psql "$DATABASE_URL" -f scripts/sql/credit-drift-check.sql
--
-- real_credit uses the same rule as lib/tailoring-credit.ts:
--   own invoice (root + supplementary, not cancelled/draft) → unpaid invoice balance
--   shared invoice or no invoice                              → order total − paid
WITH per_order AS (
  SELECT o.customer_id, o.order_number, o.credit_amount AS stored,
         GREATEST(0, ROUND((
           CASE
             WHEN o.invoice_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM tailoring_orders s WHERE s.invoice_id = o.invoice_id AND s.id <> o.id)
               THEN COALESCE((SELECT SUM(i.grand_total - i.amount_paid) FROM invoices i
                              WHERE (i.id = o.invoice_id OR i.supplementary_of_invoice_id = o.invoice_id)
                                AND i.status NOT IN ('cancelled','draft')), 0)
             ELSE o.total_amount - o.amount_paid
           END)::numeric, 2)) AS real
  FROM tailoring_orders o
  WHERE o.credited_at IS NOT NULL
)
SELECT c.name, c.phone,
       SUM(p.stored) AS stored_credit,
       SUM(p.real)   AS real_credit,
       SUM(p.stored) - SUM(p.real) AS difference,
       (SELECT COALESCE(SUM(i.grand_total - i.amount_paid), 0) FROM invoices i
        WHERE i.customer_id = c.id AND i.status IN ('issued','partially_paid','overdue')) AS outstanding_invoices,
       string_agg(p.order_number || ' ' || p.stored || '→' || p.real, ', ' ORDER BY p.order_number)
         FILTER (WHERE p.stored IS DISTINCT FROM p.real) AS orders_affected
FROM per_order p JOIN customers c ON c.id = p.customer_id
GROUP BY c.id, c.name, c.phone
HAVING SUM(p.stored) IS DISTINCT FROM SUM(p.real)
ORDER BY ABS(SUM(p.stored) - SUM(p.real)) DESC;
