import { query } from '@/lib/db';
import { applyInvoicePayment } from '@/lib/invoice-payment';

export interface DueInvoice {
  id: string; invoice_number: string; invoice_date: string; source: string;
  grand_total: number; amount_paid: number; balance: number; order_numbers: string | null;
}

export async function searchCustomers(q: string) {
  const like = `%${q.trim()}%`;
  const { rows } = await query<{ id: string; name: string; phone: string | null; outstanding: string }>(
    `SELECT c.id, c.name, c.phone,
            COALESCE((SELECT SUM(grand_total - amount_paid) FROM invoices i
                      WHERE i.customer_id = c.id AND i.status IN ('issued','partially_paid','overdue')
                        AND i.grand_total > i.amount_paid), 0)::text AS outstanding
     FROM customers c
     WHERE c.deleted_at IS NULL AND (c.name ILIKE $1 OR c.phone ILIKE $1)
     ORDER BY c.name LIMIT 20`,
    [like]
  );
  return rows.map((r) => ({ ...r, outstanding: Number(r.outstanding) }));
}

/**
 * Outstanding dues = open invoice balances (retail and tailoring — a tailoring
 * order's dues live on its invoice once it's ready/delivered). Orders still in
 * progress have no invoice yet; they're listed separately for information
 * only, because the silent due-clear path works on invoices.
 */
export async function customerDues(customerId: string) {
  const [cust, inv, orders] = await Promise.all([
    query<{ name: string; phone: string | null }>('SELECT name, phone FROM customers WHERE id=$1', [customerId]),
    query<DueInvoice>(
      `SELECT i.id, i.invoice_number, i.invoice_date::text, i.source,
              i.grand_total::float AS grand_total, i.amount_paid::float AS amount_paid,
              (i.grand_total - i.amount_paid)::float AS balance,
              (SELECT string_agg(o.order_number, ', ') FROM tailoring_orders o
               WHERE o.invoice_id = COALESCE(i.supplementary_of_invoice_id, i.id)) AS order_numbers
       FROM invoices i
       WHERE i.customer_id = $1 AND i.status IN ('issued','partially_paid','overdue') AND i.grand_total > i.amount_paid
       ORDER BY i.invoice_date, i.invoice_number`,
      [customerId]
    ),
    query<{ order_number: string; status: string; balance: number }>(
      `SELECT order_number, status, (total_amount - amount_paid)::float AS balance
       FROM tailoring_orders
       WHERE customer_id = $1 AND invoice_id IS NULL AND total_amount > amount_paid
       ORDER BY order_number`,
      [customerId]
    ),
  ]);
  return { customer: cust.rows[0] ?? null, invoices: inv.rows, uninvoicedOrders: orders.rows };
}

/**
 * Clears the chosen open invoices of ONE customer through the same silent
 * pipeline as Outstanding Dues → "Clear due" (applyInvoicePayment with
 * skipNotify): invoice marked paid, linked tailoring order synced, retail
 * payment journal posted (tailoring: none — outside accounting). Never sends
 * WhatsApp. Invoices not belonging to the customer or no longer open are ignored.
 */
export async function clearCustomerDues(customerId: string, invoiceIds: string[] | 'all', actingUserId: string) {
  const { invoices } = await customerDues(customerId);
  const chosen = invoiceIds === 'all' ? invoices : invoices.filter((i) => invoiceIds.includes(i.id));
  const cleared: Array<{ invoice_number: string; amount: number }> = [];
  for (const inv of chosen) {
    if (inv.balance <= 0) continue;
    const mode = (await query<{ payment_mode: string | null }>('SELECT payment_mode FROM invoices WHERE id=$1', [inv.id]))
      .rows[0]?.payment_mode ?? 'cash';
    await applyInvoicePayment(inv.id, inv.balance, mode, { userId: actingUserId }, { skipNotify: true });
    cleared.push({ invoice_number: inv.invoice_number, amount: inv.balance });
  }
  return cleared;
}
