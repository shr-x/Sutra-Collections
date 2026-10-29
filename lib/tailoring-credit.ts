import type { QueryResultRow } from 'pg';
import { query as dbQuery } from '@/lib/db';

interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
}

/**
 * tailoring_orders.credit_amount = what a delivered-on-credit order still owes.
 *
 * It used to be a running figure: +balance at "delivered on credit", −payment
 * on two payment paths. Every other path that changes a due (invoice cancel,
 * SHRX invoice delete, a swallowed sync error, older batches sharing one
 * invoice, an order whose invoice was never created) left it stale — e.g.
 * the customer page showing "On Credit ₹477" with Outstanding "-".
 *
 * Now it is RECOMPUTED from the real balances by this one function, called
 * from every path that changes a due. For an order delivered on credit
 * (credited_at set):
 *   - own invoice (root + supplementary, not cancelled/draft): the unpaid
 *     balance of those invoices — the same rows Outstanding is built from;
 *   - invoice shared with sibling orders (older grouped billing) or no
 *     invoice at all: the order's own total − paid.
 * Orders never delivered on credit are not touched.
 */
const RECOMPUTE_SQL = (where: string) => `
  UPDATE tailoring_orders o
  SET credit_amount = GREATEST(0, ROUND((
    CASE
      WHEN o.invoice_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM tailoring_orders s WHERE s.invoice_id = o.invoice_id AND s.id <> o.id)
        THEN COALESCE((SELECT SUM(i.grand_total - i.amount_paid) FROM invoices i
                       WHERE (i.id = o.invoice_id OR i.supplementary_of_invoice_id = o.invoice_id)
                         AND i.status NOT IN ('cancelled', 'draft')), 0)
      ELSE o.total_amount - o.amount_paid
    END)::numeric, 2))
  WHERE o.credited_at IS NOT NULL AND ${where}
    AND o.credit_amount IS DISTINCT FROM GREATEST(0, ROUND((
      CASE
        WHEN o.invoice_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM tailoring_orders s WHERE s.invoice_id = o.invoice_id AND s.id <> o.id)
          THEN COALESCE((SELECT SUM(i.grand_total - i.amount_paid) FROM invoices i
                         WHERE (i.id = o.invoice_id OR i.supplementary_of_invoice_id = o.invoice_id)
                           AND i.status NOT IN ('cancelled', 'draft')), 0)
        ELSE o.total_amount - o.amount_paid
      END)::numeric, 2))`;

/**
 * Scope: only the orders an action actually touched. Older orders of the same
 * customer whose stored figure drifted before this fix are deliberately left
 * alone — correcting them is the reviewed one-off script
 * (scripts/sql/credit-drift-fix.sql), not a side effect of an unrelated payment.
 */

/** Recompute credit for these tailoring orders. */
export async function recomputeCreditForOrders(orderIds: string[], db: Queryable = { query: dbQuery }) {
  if (!orderIds.length) return;
  await db.query(RECOMPUTE_SQL('o.id = ANY($1::uuid[])'), [orderIds]);
}

/** Recompute credit for the orders linked to these invoices (root or supplementary). */
export async function recomputeCreditForInvoices(invoiceIds: string[], db: Queryable = { query: dbQuery }) {
  if (!invoiceIds.length) return;
  await db.query(
    RECOMPUTE_SQL(`o.invoice_id IN (SELECT COALESCE(supplementary_of_invoice_id, id) FROM invoices WHERE id = ANY($1::uuid[]))`),
    [invoiceIds]
  );
}

/**
 * Customer-page figures, DERIVED from unpaid invoices (no stored number), so
 * "On Credit" is always a part of "Outstanding" and can never drift from it.
 *   outstanding = unpaid balance of open invoices (retail + tailoring)
 *   onCredit    = the part of that from tailoring invoices whose order was
 *                 delivered on credit
 */
export async function customerDueFigures(customerId: string): Promise<{ outstanding: number; onCredit: number }> {
  const res = await dbQuery<{ outstanding: string; on_credit: string }>(
    `SELECT
       COALESCE(SUM(i.grand_total - i.amount_paid), 0)::text AS outstanding,
       COALESCE(SUM(i.grand_total - i.amount_paid) FILTER (
         WHERE i.source = 'tailoring' AND EXISTS (
           SELECT 1 FROM tailoring_orders o
           WHERE o.invoice_id = COALESCE(i.supplementary_of_invoice_id, i.id)
             AND o.credited_at IS NOT NULL AND o.status = 'delivered')
       ), 0)::text AS on_credit
     FROM invoices i
     WHERE i.customer_id = $1 AND i.status IN ('issued','partially_paid','overdue') AND i.grand_total > i.amount_paid`,
    [customerId]
  );
  return { outstanding: Number(res.rows[0].outstanding), onCredit: Number(res.rows[0].on_credit) };
}

