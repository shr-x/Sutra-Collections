import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import { resolveStockVariant } from '@/lib/stock-variant';

/**
 * SHRX hard delete of a retail/tailoring invoice or a tailoring order, undoing
 * every side effect in ONE transaction. Tables touched (and why):
 *
 *   invoices                   the invoice(s) themselves; supplementary
 *                              (alteration) invoices of a deleted root go too
 *   invoice_items              CASCADE from invoices
 *   reminder_logs              CASCADE from invoices
 *   stock                      retail finished-goods quantities put back
 *                              (via lib/stock-variant.ts — never writes NULL)
 *   stock_movements            the invoice's own movement rows removed (they
 *                              would point at a deleted invoice)
 *   journal_entries / _lines   every entry referencing the invoice (sale,
 *                              payments, store credit, cancel reversal) removed;
 *                              lines CASCADE. Tailoring invoices normally have
 *                              none (outside accounting) — old ones may.
 *   loyalty_transactions       points earned/redeemed on the invoice removed and
 *   customers.loyalty_points_balance   …the balance moved back (never below 0)
 *   store_credit_transactions  store credit applied to the invoice removed and
 *   customers.store_credit_balance     …given back
 *   quotations                 converted_to_invoice_id cleared, status
 *                              'converted' → 'accepted'
 *   tailoring_orders           invoice_id cleared when only the invoice is
 *                              deleted; the order row itself when deleting an order
 *   tailoring_payments         CASCADE from tailoring_orders (the order's payments)
 *   tailoring_alterations      CASCADE from tailoring_orders
 *
 * Customer dues need no separate step: they are always derived from invoice
 * and order balances, so they disappear with the rows.
 *
 * BLOCKED when any credit note (refund) exists against an invoice in scope —
 * the refunds must be deleted first; the error names them.
 * Kept on purpose: audit_log, shrx_audit_log, whatsapp_message_log (history),
 * measurement versions (customer data, not an order side effect).
 */

export type DeleteKind = 'invoice' | 'tailoring_order';

interface InvRow {
  id: string; invoice_number: string; source: string; status: string;
  warehouse_id: string; customer_id: string | null; grand_total: string; amount_paid: string;
  supplementary_of_invoice_id: string | null;
}

export interface DeletePlan {
  kind: DeleteKind;
  id: string;
  number: string;
  customerName: string | null;
  blockers: string[];
  invoices: Array<{ id: string; number: string; source: string; status: string; total: number; paid: number; role: 'target' | 'supplementary' | 'order invoice' }>;
  detachOrders: string[];
  keptSharedInvoice: string | null;
  order: { payments: number; paymentsTotal: number; alterations: number; total: number; paid: number } | null;
  stockRestore: Array<{ item: string; variant: string; quantity: number; invoice: string }>;
  journalEntries: number;
  loyaltyPointsReversed: number;
  storeCreditReturned: number;
  quotationsUnlinked: string[];
  stockMovementsRemoved: number;
}

async function findTarget(client: PoolClient, kind: DeleteKind, number: string, lock: boolean) {
  const forUpdate = lock ? 'FOR UPDATE' : '';
  if (kind === 'invoice') {
    const r = await client.query<InvRow>(
      `SELECT id, invoice_number, source, status, warehouse_id, customer_id, grand_total, amount_paid, supplementary_of_invoice_id
       FROM invoices WHERE invoice_number = $1 ${forUpdate}`, [number]
    );
    return r.rows[0] ? { invoice: r.rows[0], order: null } : null;
  }
  const r = await client.query<{ id: string; order_number: string; invoice_id: string | null; customer_id: string; total_amount: string; amount_paid: string }>(
    `SELECT id, order_number, invoice_id, customer_id, total_amount, amount_paid FROM tailoring_orders WHERE order_number = $1 ${forUpdate}`,
    [number]
  );
  return r.rows[0] ? { invoice: null, order: r.rows[0] } : null;
}

async function invoicesByIds(client: PoolClient, ids: string[], lock: boolean): Promise<InvRow[]> {
  if (!ids.length) return [];
  const r = await client.query<InvRow>(
    `SELECT id, invoice_number, source, status, warehouse_id, customer_id, grand_total, amount_paid, supplementary_of_invoice_id
     FROM invoices WHERE id = ANY($1::uuid[]) ORDER BY created_at ${lock ? 'FOR UPDATE' : ''}`, [ids]
  );
  return r.rows;
}

/** Retail invoices that actually took stock: not cancelled (cancel already put it back) and not draft (never deducted). */
const tookStock = (inv: InvRow) => inv.source !== 'tailoring' && inv.status !== 'cancelled' && inv.status !== 'draft';

export async function buildDeletePlan(client: PoolClient, kind: DeleteKind, number: string, lock = false): Promise<DeletePlan | null> {
  const target = await findTarget(client, kind, number.trim(), lock);
  if (!target) return null;

  let scope: InvRow[] = [];
  const roles = new Map<string, DeletePlan['invoices'][number]['role']>();
  let detachOrders: string[] = [];
  let keptSharedInvoice: string | null = null;
  let order: DeletePlan['order'] = null;
  let customerId: string | null;

  if (target.invoice) {
    const inv = target.invoice;
    customerId = inv.customer_id;
    const supp = inv.supplementary_of_invoice_id
      ? []
      : (await client.query<{ id: string }>('SELECT id FROM invoices WHERE supplementary_of_invoice_id=$1', [inv.id])).rows.map((r) => r.id);
    scope = [inv, ...(await invoicesByIds(client, supp, lock))];
    roles.set(inv.id, 'target');
    supp.forEach((id) => roles.set(id, 'supplementary'));
    detachOrders = (await client.query<{ order_number: string }>(
      'SELECT order_number FROM tailoring_orders WHERE invoice_id = ANY($1::uuid[]) ORDER BY order_number', [scope.map((s) => s.id)]
    )).rows.map((r) => r.order_number);
  } else {
    const o = target.order!;
    customerId = o.customer_id;
    const pays = await client.query<{ n: string; total: string }>(
      'SELECT COUNT(*)::text AS n, COALESCE(SUM(amount),0)::text AS total FROM tailoring_payments WHERE tailoring_order_id=$1', [o.id]
    );
    const alts = await client.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM tailoring_alterations WHERE tailoring_order_id=$1', [o.id]);
    order = {
      payments: Number(pays.rows[0].n), paymentsTotal: Number(pays.rows[0].total),
      alterations: Number(alts.rows[0].n), total: Number(o.total_amount), paid: Number(o.amount_paid),
    };
    if (o.invoice_id) {
      const others = await client.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM tailoring_orders WHERE invoice_id=$1 AND id<>$2', [o.invoice_id, o.id]
      );
      if (Number(others.rows[0].n) > 0) {
        // Invoice shared with other orders (legacy grouped invoicing): keep it, only the order goes.
        keptSharedInvoice = (await invoicesByIds(client, [o.invoice_id], false))[0]?.invoice_number ?? null;
      } else {
        const supp = (await client.query<{ id: string }>('SELECT id FROM invoices WHERE supplementary_of_invoice_id=$1', [o.invoice_id])).rows.map((r) => r.id);
        scope = await invoicesByIds(client, [o.invoice_id, ...supp], lock);
        roles.set(o.invoice_id, 'order invoice');
        supp.forEach((id) => roles.set(id, 'supplementary'));
      }
    }
  }

  const ids = scope.map((s) => s.id);

  const cn = await client.query<{ credit_note_number: string; invoice_number: string }>(
    `SELECT cn.credit_note_number, i.invoice_number FROM credit_notes cn JOIN invoices i ON i.id = cn.invoice_id
     WHERE cn.invoice_id = ANY($1::uuid[]) ORDER BY cn.credit_note_number`, [ids]
  );
  const blockers = cn.rows.map((r) => `Refund ${r.credit_note_number} exists against ${r.invoice_number} — delete the refund first.`);

  const stockRestore: DeletePlan['stockRestore'] = [];
  for (const inv of scope.filter(tookStock)) {
    const lines = await client.query<{ name: string; quantity: string; size: string | null; color: string | null }>(
      `SELECT it.name, ii.quantity::text, sz.size_name AS size, cl.color_name AS color
       FROM invoice_items ii JOIN items it ON it.id = ii.item_id
       LEFT JOIN item_sizes sz ON sz.id = ii.size_id LEFT JOIN item_colors cl ON cl.id = ii.color_id
       WHERE ii.invoice_id = $1 AND it.item_type = 'finished' ORDER BY ii.sort_order`, [inv.id]
    );
    for (const l of lines.rows) {
      stockRestore.push({ item: l.name, variant: [l.color, l.size].filter(Boolean).join(' / ') || 'default', quantity: Number(l.quantity), invoice: inv.invoice_number });
    }
  }

  const counts = await client.query<{ je: string; loyalty: string; credit: string; moves: string }>(
    `SELECT
       (SELECT COUNT(*) FROM journal_entries WHERE reference_id = ANY($1::uuid[]))::text AS je,
       (SELECT COALESCE(SUM(points),0) FROM loyalty_transactions WHERE reference_id = ANY($1::uuid[]))::text AS loyalty,
       (SELECT COALESCE(SUM(amount),0) FROM store_credit_transactions WHERE reference_id = ANY($1::uuid[]))::text AS credit,
       (SELECT COUNT(*) FROM stock_movements WHERE reference_id = ANY($1::uuid[]))::text AS moves`,
    [ids]
  );
  const quotes = await client.query<{ quotation_number: string }>(
    'SELECT quotation_number FROM quotations WHERE converted_to_invoice_id = ANY($1::uuid[])', [ids]
  ).catch(() => ({ rows: [] as { quotation_number: string }[] }));
  const cust = customerId
    ? (await client.query<{ name: string }>('SELECT name FROM customers WHERE id=$1', [customerId])).rows[0]?.name ?? null
    : null;

  return {
    kind,
    id: target.invoice?.id ?? target.order!.id,
    number: target.invoice?.invoice_number ?? target.order!.order_number,
    customerName: cust,
    blockers,
    invoices: scope.map((s) => ({
      id: s.id, number: s.invoice_number, source: s.source, status: s.status,
      total: Number(s.grand_total), paid: Number(s.amount_paid), role: roles.get(s.id) ?? 'target',
    })),
    detachOrders: kind === 'invoice' ? detachOrders : [],
    keptSharedInvoice,
    order,
    stockRestore,
    journalEntries: Number(counts.rows[0].je),
    loyaltyPointsReversed: Number(counts.rows[0].loyalty),
    storeCreditReturned: -Number(counts.rows[0].credit),
    quotationsUnlinked: quotes.rows.map((q) => q.quotation_number),
    stockMovementsRemoved: Number(counts.rows[0].moves),
  };
}

export async function previewDelete(kind: DeleteKind, number: string): Promise<DeletePlan | null> {
  const client = await pool.connect();
  try {
    return await buildDeletePlan(client, kind, number, false);
  } finally {
    client.release();
  }
}

/** Put `qty` back into stock for one invoice line (same matching as refunds). */
async function restoreLineStock(
  client: PoolClient, itemId: string, warehouseId: string, sizeId: string | null, colorId: string | null, qty: number
) {
  const v = await resolveStockVariant(client, itemId, sizeId, colorId);
  const upd = await client.query(
    `UPDATE stock SET quantity = quantity + $1
     WHERE item_id=$2 AND warehouse_id=$3
       AND COALESCE(size_id,  (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
           IS NOT DISTINCT FROM COALESCE($4::uuid, (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
       AND COALESCE(color_id, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
           IS NOT DISTINCT FROM COALESCE($5::uuid, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))`,
    [qty, itemId, warehouseId, v.sizeId, v.colorId]
  );
  if ((upd.rowCount ?? 0) === 0) {
    await client.query(
      'INSERT INTO stock (item_id, size_id, color_id, warehouse_id, quantity) VALUES ($1,$2,$3,$4,$5)',
      [itemId, v.sizeId, v.colorId, warehouseId, qty]
    );
  }
}

export class DeleteBlockedError extends Error {}

/**
 * Executes the delete. `confirm` must equal the document number exactly.
 * Everything is re-read under row locks inside the transaction, so the plan
 * acted on is the one that's current, not a stale preview.
 */
export async function executeDelete(kind: DeleteKind, number: string, confirm: string): Promise<DeletePlan> {
  if (confirm.trim() !== number.trim()) throw new DeleteBlockedError('The typed number does not match.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const plan = await buildDeletePlan(client, kind, number, true);
    if (!plan) throw new DeleteBlockedError(`${number} was not found.`);
    if (plan.blockers.length) throw new DeleteBlockedError(plan.blockers.join(' '));

    const ids = plan.invoices.map((i) => i.id);
    const invs = await invoicesByIds(client, ids, true);

    // 1. Stock back for retail invoices that took it.
    for (const inv of invs.filter(tookStock)) {
      const lines = await client.query<{ item_id: string; size_id: string | null; color_id: string | null; quantity: string }>(
        `SELECT ii.item_id, ii.size_id, ii.color_id, ii.quantity::text
         FROM invoice_items ii JOIN items it ON it.id = ii.item_id
         WHERE ii.invoice_id = $1 AND it.item_type = 'finished'`, [inv.id]
      );
      for (const l of lines.rows) {
        await restoreLineStock(client, l.item_id, inv.warehouse_id, l.size_id, l.color_id, Number(l.quantity));
      }
    }
    if (ids.length) {
      await client.query('DELETE FROM stock_movements WHERE reference_id = ANY($1::uuid[])', [ids]);

      // 2. Loyalty points and store credit back to how they were.
      await client.query(
        `UPDATE customers c SET loyalty_points_balance = GREATEST(0, c.loyalty_points_balance - t.pts)
         FROM (SELECT customer_id, SUM(points) AS pts FROM loyalty_transactions
               WHERE reference_id = ANY($1::uuid[]) GROUP BY customer_id) t
         WHERE c.id = t.customer_id`, [ids]
      );
      await client.query('DELETE FROM loyalty_transactions WHERE reference_id = ANY($1::uuid[])', [ids]);
      await client.query(
        `UPDATE customers c SET store_credit_balance = c.store_credit_balance - t.amt
         FROM (SELECT customer_id, SUM(amount) AS amt FROM store_credit_transactions
               WHERE reference_id = ANY($1::uuid[]) GROUP BY customer_id) t
         WHERE c.id = t.customer_id`, [ids]
      );
      await client.query('DELETE FROM store_credit_transactions WHERE reference_id = ANY($1::uuid[])', [ids]);

      // 3. Journal entries (sale, payments, store credit, cancel reversal). Lines CASCADE.
      await client.query('DELETE FROM journal_entries WHERE reference_id = ANY($1::uuid[])', [ids]);

      // 4. Quotation links.
      await client.query(
        `UPDATE quotations SET converted_to_invoice_id = NULL,
                status = CASE WHEN status = 'converted' THEN 'accepted' ELSE status END
         WHERE converted_to_invoice_id = ANY($1::uuid[])`, [ids]
      );

      // 5. Tailoring ↔ invoice links (only matters when deleting an invoice;
      //    an order being deleted goes entirely in step 7).
      await client.query('UPDATE tailoring_orders SET invoice_id = NULL WHERE invoice_id = ANY($1::uuid[])', [ids]);

      // 6. The invoices — supplementary first, then the root. Items + reminder logs CASCADE.
      await client.query('DELETE FROM invoices WHERE id = ANY($1::uuid[]) AND supplementary_of_invoice_id IS NOT NULL', [ids]);
      await client.query('DELETE FROM invoices WHERE id = ANY($1::uuid[])', [ids]);
    }

    // 7. The order (payments + alterations CASCADE).
    if (kind === 'tailoring_order') {
      await client.query('DELETE FROM tailoring_orders WHERE id = $1', [plan.id]);
    }

    await client.query('COMMIT');
    return plan;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
