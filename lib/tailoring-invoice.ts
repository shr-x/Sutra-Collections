/**
 * Real GST tax invoice generation for tailoring orders.
 *
 * Tailoring orders reference a `design`, not a real `items` row, so we route
 * every tailoring invoice line through one system item ("Tailoring Services",
 * item_type='service', is_active=false so it never appears in pickers/stock)
 * and store the actual design name via invoice_items.description_override.
 *
 * This module only handles the REAL, final GST invoice (created once the
 * order first reaches ready_for_pickup). The pre-stitching PROFORMA PDF is
 * generated straight from tailoring_orders data in lib/pdf-generator.ts and
 * never touches the invoices table or the ledger.
 */
import type { PoolClient } from 'pg';
import { pool, query } from '@/lib/db';
import { calcLine } from '@/lib/gst';
import { nextInvoiceNumber } from '@/lib/invoice-number';
import { postSalesInvoice, postJournalEntry, type JournalLine } from '@/lib/accounting';
import { logAudit } from '@/lib/audit';

const SERVICE_ITEM_NAME = 'Tailoring Services';

async function getOrCreateServiceItemId(client: PoolClient): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM items WHERE name=$1 AND item_type='service' LIMIT 1`,
    [SERVICE_ITEM_NAME]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await client.query<{ id: string }>(
    `INSERT INTO items (name, unit, item_type, gst_rate, hsn_code, is_active)
     VALUES ($1, 'pcs', 'service', 5, '9988', FALSE) RETURNING id`,
    [SERVICE_ITEM_NAME]
  );
  return created.rows[0].id;
}

function invoiceStatus(amountPaid: number, grandTotal: number): string {
  if (amountPaid >= grandTotal) return 'paid';
  if (amountPaid > 0) return 'partially_paid';
  return 'issued';
}

/** Reverses a previously-posted journal entry for a reference (debit/credit swapped), same-day. */
async function reverseJournalEntry(
  referenceType: 'invoice',
  referenceId: string,
  description: string,
  entryDate: string,
  createdBy: string,
  client: PoolClient
): Promise<void> {
  const entries = await client.query<{ id: string }>(
    `SELECT id FROM journal_entries WHERE reference_type=$1 AND reference_id=$2 ORDER BY entry_date ASC`,
    [referenceType, referenceId]
  );
  if (!entries.rows.length) return;

  const lines: JournalLine[] = [];
  for (const entry of entries.rows) {
    const ls = await client.query<{ account_code: string; debit_amount: string; credit_amount: string }>(
      `SELECT a.account_code, jl.debit_amount, jl.credit_amount
       FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
       WHERE jl.journal_entry_id=$1`,
      [entry.id]
    );
    for (const l of ls.rows) {
      const debit = Number(l.debit_amount);
      const credit = Number(l.credit_amount);
      if (debit === 0 && credit === 0) continue;
      // swap debit/credit to reverse
      lines.push({ accountCode: l.account_code, debit: credit, credit: debit });
    }
  }
  if (!lines.length) return;

  await postJournalEntry({
    entryDate,
    description,
    referenceType,
    referenceId,
    createdBy,
    lines,
  }, client);
}

interface TailoringOrderRow {
  id: string;
  order_number: string;
  group_number: string | null;
  customer_id: string;
  warehouse_id: string | null;
  total_amount: string;
  amount_paid: string;
  gst_rate: string;
  invoice_id: string | null;
  design_name: string;
  created_by: string | null;
  notes: string | null;
}

const ORDER_SELECT = `
  SELECT o.id, o.order_number, o.group_number, o.customer_id, o.warehouse_id,
         o.total_amount::text, o.amount_paid::text, o.gst_rate::text,
         o.invoice_id, d.name AS design_name, o.created_by, o.notes
  FROM tailoring_orders o JOIN designs d ON d.id = o.design_id
  WHERE o.id=$1
`;

async function fetchOrder(orderId: string, client: PoolClient): Promise<TailoringOrderRow | null> {
  const res = await client.query<TailoringOrderRow>(ORDER_SELECT, [orderId]);
  return res.rows[0] ?? null;
}

async function fetchOrderPlain(orderId: string): Promise<TailoringOrderRow | null> {
  const res = await query<TailoringOrderRow>(ORDER_SELECT, [orderId]);
  return res.rows[0] ?? null;
}

/**
 * Creates the real, final GST tax invoice for a tailoring order the FIRST
 * time it reaches ready_for_pickup. Posts the same journal entry a normal
 * sales invoice would (postSalesInvoice) and links tailoring_orders.invoice_id.
 * No-op (returns null) if the order already has an invoice.
 */
export async function createTailoringInvoice(
  orderId: string,
  actingUserId: string
): Promise<{ invoiceId: string; invoiceNumber: string } | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const order = await fetchOrder(orderId, client);
    if (!order || order.invoice_id || !order.warehouse_id) {
      await client.query('ROLLBACK');
      return null;
    }

    const serviceItemId = await getOrCreateServiceItemId(client);
    const grandTotal = Number(order.total_amount);
    const gstRate = Number(order.gst_rate);
    const amountPaid = Math.min(Number(order.amount_paid), grandTotal);

    const lr = calcLine({ quantity: 1, rate: grandTotal, gstRate, isScheme: false });
    const invoiceNumber = await nextInvoiceNumber('INV', client);
    const invoiceDate = new Date().toISOString().slice(0, 10);
    const status = invoiceStatus(amountPaid, grandTotal);

    const insRes = await client.query<{ id: string }>(
      `INSERT INTO invoices (
         invoice_number, invoice_type, status, customer_id, warehouse_id,
         invoice_date, is_scheme_invoice, payment_mode, amount_paid,
         subtotal, total_cgst, total_sgst, grand_total, notes, created_by, source
       ) VALUES ($1,'gst',$2,$3,$4,$5,FALSE,NULL,$6,$7,$8,$9,$10,$11,$12,'tailoring')
       RETURNING id`,
      [
        invoiceNumber, status, order.customer_id, order.warehouse_id, invoiceDate,
        amountPaid, lr.totalAmount, lr.cgstAmount, lr.sgstAmount, lr.totalAmount,
        // Real order notes/special-instructions (#3), not an auto-generated
        // "Tailoring order X" reference — null omits the Notes box on the PDF
        // entirely rather than showing an empty one.
        order.notes?.trim() || null,
        order.created_by ?? actingUserId,
      ]
    );
    const invoiceId = insRes.rows[0].id;

    const description = `${order.design_name} (${order.group_number ?? order.order_number})`;
    await client.query(
      `INSERT INTO invoice_items (
         invoice_id, item_id, sort_order, description_override,
         quantity, rate, discount_amount, hsn_code, gst_rate,
         taxable_value, cgst_amount, sgst_amount, total_amount
       ) VALUES ($1,$2,0,$3,1,$4,0,'9988',$5,$6,$7,$8,$9)`,
      [invoiceId, serviceItemId, description, grandTotal, gstRate,
       lr.taxableValue, lr.cgstAmount, lr.sgstAmount, lr.totalAmount]
    );

    await postSalesInvoice({
      invoiceId, invoiceNumber, invoiceDate,
      grandTotal: lr.totalAmount, taxableValue: lr.taxableValue,
      totalCgst: lr.cgstAmount, totalSgst: lr.sgstAmount,
      paymentMode: null, amountPaid,
      createdBy: order.created_by ?? actingUserId,
    }, client);

    await client.query(`UPDATE tailoring_orders SET invoice_id=$1 WHERE id=$2`, [invoiceId, orderId]);

    await client.query('COMMIT');
    return { invoiceId, invoiceNumber };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createTailoringInvoice]', err);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Sum of everything already billed against an order's original invoice:
 * the original invoice's own grand_total, plus every supplementary invoice
 * that points back at it. Used to compute the correct delta for a THIRD (or
 * later) alteration on a locked invoice, so it only bills the further
 * increase rather than re-billing an amount an earlier supplementary
 * invoice already covered.
 */
async function alreadyInvoicedTotal(rootInvoiceId: string, rootGrandTotal: number): Promise<number> {
  const res = await query<{ total: string | null }>(
    `SELECT SUM(grand_total)::text AS total FROM invoices WHERE supplementary_of_invoice_id=$1`,
    [rootInvoiceId]
  );
  return rootGrandTotal + Number(res.rows[0]?.total ?? 0);
}

/**
 * Creates a new, normal invoice (standard invoice_sequences numbering, full
 * journal/ledger posting via postSalesInvoice — additive, NOT a reversal) for
 * just the price DIFFERENCE on top of a locked root invoice. The root invoice
 * itself is never touched. Returns null if the delta isn't positive (a
 * decrease on a locked invoice has no "sales debit note" equivalent in this
 * codebase and is handled by the locked_flagged path instead).
 */
async function createSupplementaryInvoice(
  order: TailoringOrderRow,
  rootInvoice: { id: string; invoice_number: string },
  deltaAmount: number,
  actingUserId: string
): Promise<{ invoiceId: string; invoiceNumber: string } | null> {
  if (deltaAmount <= 0 || !order.warehouse_id) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const serviceItemId = await getOrCreateServiceItemId(client);
    const gstRate = Number(order.gst_rate);
    const lr = calcLine({ quantity: 1, rate: deltaAmount, gstRate, isScheme: false });
    const invoiceNumber = await nextInvoiceNumber('INV', client);
    const invoiceDate = new Date().toISOString().slice(0, 10);
    const displayRef = order.group_number ?? order.order_number;
    const notes = `Supplementary charge for alteration on ${rootInvoice.invoice_number}`;

    const insRes = await client.query<{ id: string }>(
      `INSERT INTO invoices (
         invoice_number, invoice_type, status, customer_id, warehouse_id,
         invoice_date, is_scheme_invoice, payment_mode, amount_paid,
         subtotal, total_cgst, total_sgst, grand_total, notes, created_by,
         supplementary_of_invoice_id, source
       ) VALUES ($1,'gst','issued',$2,$3,$4,FALSE,NULL,0,$5,$6,$7,$8,$9,$10,$11,'tailoring')
       RETURNING id`,
      [
        invoiceNumber, order.customer_id, order.warehouse_id, invoiceDate,
        lr.totalAmount, lr.cgstAmount, lr.sgstAmount, lr.totalAmount,
        notes, order.created_by ?? actingUserId, rootInvoice.id,
      ]
    );
    const invoiceId = insRes.rows[0].id;

    const description = `Alteration charge — ${order.design_name} (${displayRef})`;
    await client.query(
      `INSERT INTO invoice_items (
         invoice_id, item_id, sort_order, description_override,
         quantity, rate, discount_amount, hsn_code, gst_rate,
         taxable_value, cgst_amount, sgst_amount, total_amount
       ) VALUES ($1,$2,0,$3,1,$4,0,'9988',$5,$6,$7,$8,$9)`,
      [invoiceId, serviceItemId, description, deltaAmount, gstRate,
       lr.taxableValue, lr.cgstAmount, lr.sgstAmount, lr.totalAmount]
    );

    await postSalesInvoice({
      invoiceId, invoiceNumber, invoiceDate,
      grandTotal: lr.totalAmount, taxableValue: lr.taxableValue,
      totalCgst: lr.cgstAmount, totalSgst: lr.sgstAmount,
      paymentMode: null, amountPaid: 0,
      createdBy: order.created_by ?? actingUserId,
    }, client);

    await client.query('COMMIT');

    logAudit({
      userId: actingUserId, action: 'create', entityType: 'invoice', entityId: invoiceId,
      entityLabel: invoiceNumber,
      newValue: {
        flag: 'tailoring_alteration_supplementary_invoice',
        order: displayRef, root_invoice: rootInvoice.invoice_number, delta_amount: deltaAmount,
      },
    }).catch(() => {});

    return { invoiceId, invoiceNumber };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createSupplementaryInvoice]', err);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Called when an altered order returns to ready_for_pickup a second (or
 * later) time. The order already has a linked invoice from its first
 * ready_for_pickup transition.
 *
 * - Total unchanged -> no-op (the alteration-completed WhatsApp text already
 *   carries the up-to-date balance; regenerating the same tax invoice would
 *   be pointless).
 * - Total increased, invoice still within the 1-hour edit grace window (same
 *   rule billing/invoices/actions.ts's updateInvoiceAction uses) -> amend the
 *   invoice in place (same invoice_number), reversing and reposting its
 *   journal entry so the ledger reflects the corrected total.
 * - Total increased, invoice locked (>1hr old) -> the root invoice is a filed
 *   tax document and is NEVER modified. Instead, a new standard invoice is
 *   created for just the delta (nextInvoiceNumber, full journal posting via
 *   postSalesInvoice — additive, not a reversal), linked back to the root via
 *   invoices.supplementary_of_invoice_id, with notes referencing the root
 *   invoice number. Sent to the customer the same way a ready-for-pickup
 *   invoice is sent.
 * - Total DECREASED on a locked invoice -> still flagged via the audit log
 *   only (unchanged from before). There's no "sales debit note" concept in
 *   this codebase to correct a decrease on a locked invoice — credit_notes
 *   are the closest fit but are a different workflow (refund/store-credit
 *   resolution) and weren't asked for here.
 */
export async function syncTailoringInvoiceAfterAlteration(
  orderId: string,
  actingUserId: string
): Promise<{
  action: 'unchanged' | 'amended_in_place' | 'supplementary_invoice_created' | 'locked_flagged' | 'no_invoice';
  invoiceId: string | null;
  invoiceNumber: string | null;
}> {
  const orderRes = await query<{
    total_amount: string; order_number: string; group_number: string | null; invoice_id: string | null; gst_rate: string;
  }>(
    `SELECT total_amount::text, order_number, group_number, invoice_id, gst_rate::text FROM tailoring_orders WHERE id=$1`,
    [orderId]
  );
  const orderRow = orderRes.rows[0];
  if (!orderRow?.invoice_id) return { action: 'no_invoice', invoiceId: null, invoiceNumber: null };

  const invRes = await query<{ id: string; invoice_number: string; grand_total: string; created_at: Date; status: string }>(
    `SELECT id, invoice_number, grand_total, created_at, status FROM invoices WHERE id=$1`,
    [orderRow.invoice_id]
  );
  const invoice = invRes.rows[0];
  if (!invoice) return { action: 'no_invoice', invoiceId: null, invoiceNumber: null };

  const newTotal = Number(orderRow.total_amount);
  const ageMs = Date.now() - new Date(invoice.created_at).getTime();
  const isLocked = invoice.status === 'cancelled' || ageMs > 60 * 60 * 1000;
  const displayRef = orderRow.group_number ?? orderRow.order_number;

  // Locked invoices compare against the RUNNING total (root + any prior
  // supplementary invoices), not just the root's own (unchanged) grand_total,
  // so a repeat alteration only bills the further delta.
  const baselineTotal = isLocked
    ? await alreadyInvoicedTotal(invoice.id, Number(invoice.grand_total))
    : Number(invoice.grand_total);

  if (Math.abs(newTotal - baselineTotal) < 0.005) {
    return { action: 'unchanged', invoiceId: invoice.id, invoiceNumber: invoice.invoice_number };
  }

  if (isLocked) {
    const delta = Math.round((newTotal - baselineTotal) * 100) / 100;
    if (delta > 0) {
      const fullOrder = await fetchOrderPlain(orderId);
      if (fullOrder) {
        const supplementary = await createSupplementaryInvoice(
          fullOrder, { id: invoice.id, invoice_number: invoice.invoice_number }, delta, actingUserId
        );
        if (supplementary) {
          return { action: 'supplementary_invoice_created', invoiceId: supplementary.invoiceId, invoiceNumber: supplementary.invoiceNumber };
        }
      }
    }

    logAudit({
      userId: actingUserId, action: 'update', entityType: 'invoice', entityId: invoice.id,
      entityLabel: invoice.invoice_number,
      newValue: {
        flag: 'tailoring_alteration_changed_amount_on_locked_invoice',
        order: displayRef, old_total: baselineTotal, new_total: newTotal,
      },
    }).catch(() => {});
    return { action: 'locked_flagged', invoiceId: invoice.id, invoiceNumber: invoice.invoice_number };
  }

  const oldTotal = baselineTotal;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const gstRate = Number(orderRow.gst_rate);
    const lr = calcLine({ quantity: 1, rate: newTotal, gstRate, isScheme: false });

    const invDetail = await client.query<{ amount_paid: string }>(
      `SELECT amount_paid::text FROM invoices WHERE id=$1`, [invoice.id]
    );
    const amountPaid = Math.min(Number(invDetail.rows[0].amount_paid), lr.totalAmount);
    const finalStatus = invoiceStatus(amountPaid, lr.totalAmount);

    await client.query(
      `UPDATE invoices SET subtotal=$1, total_cgst=$2, total_sgst=$3, grand_total=$4, status=$5 WHERE id=$6`,
      [lr.totalAmount, lr.cgstAmount, lr.sgstAmount, lr.totalAmount, finalStatus, invoice.id]
    );
    await client.query(
      `UPDATE invoice_items SET rate=$1, gst_rate=$2, taxable_value=$3, cgst_amount=$4, sgst_amount=$5, total_amount=$6
       WHERE invoice_id=$7`,
      [newTotal, gstRate, lr.taxableValue, lr.cgstAmount, lr.sgstAmount, lr.totalAmount, invoice.id]
    );

    const today = new Date().toISOString().slice(0, 10);
    await reverseJournalEntry('invoice', invoice.id, `Reversal — amended invoice ${invoice.invoice_number}`, today, actingUserId, client);
    await postSalesInvoice({
      invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, invoiceDate: today,
      grandTotal: lr.totalAmount, taxableValue: lr.taxableValue,
      totalCgst: lr.cgstAmount, totalSgst: lr.sgstAmount,
      paymentMode: null, amountPaid,
      createdBy: actingUserId,
    }, client);

    await client.query('COMMIT');

    logAudit({
      userId: actingUserId, action: 'update', entityType: 'invoice', entityId: invoice.id,
      entityLabel: invoice.invoice_number,
      newValue: { flag: 'tailoring_alteration_amended_invoice', order: displayRef, old_total: oldTotal, new_total: newTotal },
    }).catch(() => {});

    return { action: 'amended_in_place', invoiceId: invoice.id, invoiceNumber: invoice.invoice_number };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[syncTailoringInvoiceAfterAlteration]', err);
    return { action: 'locked_flagged', invoiceId: invoice.id, invoiceNumber: invoice.invoice_number };
  } finally {
    client.release();
  }
}
