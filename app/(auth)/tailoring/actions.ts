'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { nextInvoiceNumber } from '@/lib/invoice-number';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import {
  generateTailoringCustomerPdf, generateTailoringTailorPdf, generateBatchTailoringPdf,
  generateTailoringProformaPdf, generateInvoicePdf,
} from '@/lib/pdf-generator';
import { createTailoringInvoice, syncTailoringInvoiceAfterAlteration } from '@/lib/tailoring-invoice';
import { logAudit } from '@/lib/audit';
import type { ActionResult, TailoringStatus, TailoringPaymentMode } from '@/types';

// ── Batch notification helpers ─────────────────────────────────────────────

// Returns true only when every order in the batch has reached requiredStatus or beyond.
// passedStatuses: statuses that count as "already past" the threshold (e.g. 'delivered' counts as past 'ready_for_pickup').
async function isBatchFullyAt(batchId: string, requiredStatus: TailoringStatus, passedStatuses: TailoringStatus[]): Promise<boolean> {
  const allowed = [requiredStatus, ...passedStatuses].map((s) => `'${s}'`).join(', ');
  const res = await query<{ pending: string }>(
    `SELECT COUNT(*) FILTER (WHERE status NOT IN (${allowed})) AS pending
     FROM tailoring_orders WHERE batch_id = $1`,
    [batchId]
  );
  return parseInt(res.rows[0]?.pending ?? '1') === 0;
}

// Fetches the first order in the batch (by creation time) — used as the reference for WA.
async function batchFirstOrder(batchId: string): Promise<{ id: string; order_number: string; group_number: string | null; due_date: string | null } | null> {
  const res = await query<{ id: string; order_number: string; group_number: string | null; due_date: string | null }>(
    `SELECT id, order_number, group_number, due_date::text FROM tailoring_orders WHERE batch_id=$1 ORDER BY created_at ASC LIMIT 1`,
    [batchId]
  );
  return res.rows[0] ?? null;
}

// Sends sutra_order_delivered, honoring batch holds (only fires once, on the
// last sibling to reach 'delivered').
async function sendDeliveredWhatsApp(orderId: string): Promise<void> {
  try {
    const { rows } = await query<{
      phone: string | null; name: string; order_number: string; group_number: string | null; batch_id: string | null;
    }>(
      `SELECT c.phone, c.name, o.order_number, o.group_number, o.batch_id
       FROM tailoring_orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.id=$1`,
      [orderId]
    );
    const r = rows[0];
    if (!r?.phone) return;

    const displayRef = r.group_number ?? r.order_number;

    if (!r.batch_id) {
      await sendWhatsAppTemplate(r.phone, 'sutra_order_delivered', [r.name, displayRef]);
      return;
    }

    const allDone = await isBatchFullyAt(r.batch_id, 'delivered', []);
    if (!allDone) {
      console.log(`[sendDeliveredWhatsApp] Batch ${r.batch_id}: holding — siblings not yet delivered`);
      return;
    }

    const first = await batchFirstOrder(r.batch_id);
    const batchDisplayRef = first?.group_number ?? first?.order_number ?? displayRef;
    await sendWhatsAppTemplate(r.phone, 'sutra_order_delivered', [r.name, batchDisplayRef]);
  } catch (e) {
    console.error('[sendDeliveredWhatsApp] failed:', e);
  }
}

// Sends the ready-for-pickup notification, honoring batch holds. Branches
// between sutra_order_ready (first time) and sutra_order_alteration_completed
// (if this order has any alteration history) — same threshold-gating as delivery.
async function sendReadyForPickupWhatsApp(orderId: string): Promise<void> {
  try {
    const { rows } = await query<{
      phone: string | null; name: string; order_number: string; group_number: string | null; batch_id: string | null;
      design_name: string; total_amount: string; amount_paid: string;
    }>(
      `SELECT c.phone, c.name, o.order_number, o.group_number, o.batch_id,
              d.name AS design_name, o.total_amount::text, o.amount_paid::text
       FROM tailoring_orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN designs d ON d.id = o.design_id
       WHERE o.id=$1`,
      [orderId]
    );
    const r = rows[0];
    if (!r?.phone) return;

    const displayRef = r.group_number ?? r.order_number;

    const alterRes = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM tailoring_alterations WHERE tailoring_order_id=$1`,
      [orderId]
    );
    const hasAlterations = parseInt(alterRes.rows[0]?.cnt ?? '0', 10) > 0;
    const balance = Math.max(0, Math.round((Number(r.total_amount) - Number(r.amount_paid)) * 100) / 100);
    // WhatsApp rejects empty-string template parameters (API error #131008) —
    // always populate {{4}} with the real balance, including zero, rather than
    // omitting the line when there's nothing due.
    const balanceDueLine = `Balance due: ₹${balance.toFixed(2)}.`;

    const doSend = async (ref: string) => {
      if (hasAlterations) {
        await sendWhatsAppTemplate(r.phone!, 'sutra_order_alteration_completed', [r.name, ref, r.design_name, balanceDueLine]);
      } else {
        const pdfPath = await generateTailoringCustomerPdf(orderId).catch(() => null);
        await sendWhatsAppTemplate(r.phone!, 'sutra_order_ready', [r.name, ref], pdfPath);
      }
    };

    if (!r.batch_id) {
      await doSend(displayRef);
      return;
    }

    const allDone = await isBatchFullyAt(r.batch_id, 'ready_for_pickup', ['delivered']);
    if (!allDone) {
      console.log(`[sendReadyForPickupWhatsApp] Batch ${r.batch_id}: holding — siblings not yet ready`);
      return;
    }

    const first = await batchFirstOrder(r.batch_id);
    const batchDisplayRef = first?.group_number ?? first?.order_number ?? displayRef;
    await doSend(batchDisplayRef);
  } catch (e) {
    console.error('[sendReadyForPickupWhatsApp] failed:', e);
  }
}

// ── Create Order (called directly from client wizard) ─────────────────────

const CreateOrderInput = z.object({
  designId:        z.string().uuid(),
  customerId:      z.string().uuid(),
  measurements:    z.record(z.string().uuid(), z.string()),
  colorFabric:     z.string().max(200).optional(),
  price:           z.coerce.number().nonnegative(),
  dueDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes:           z.string().max(1000).optional(),
  invoiceId:       z.string().uuid().optional(),
  batchId:         z.string().uuid().optional(),
  suppressWhatsApp: z.boolean().optional().default(false),
  // Optional advance payment collected at creation time.
  advanceAmount:      z.coerce.number().nonnegative().optional(),
  advancePaymentMode: z.enum(['cash', 'upi', 'card']).optional(),
});

export async function createTailoringOrder(raw: unknown): Promise<{
  success: boolean;
  orderId?: string;
  error?: string;
}> {
  const session = await requireRole('admin', 'staff');

  const parsed = CreateOrderInput.safeParse(raw);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const {
    designId, customerId, measurements, colorFabric, price, dueDate, notes,
    invoiceId, batchId, suppressWhatsApp, advanceAmount, advancePaymentMode,
  } = parsed.data;

  const custRes = await query<{ phone: string | null; name: string }>(
    'SELECT phone, name FROM customers WHERE id=$1', [customerId]
  );
  if (!custRes.rows[0]?.phone) {
    return { success: false, error: 'Customer must have a phone number for tailoring orders.' };
  }
  const customerPhone = custRes.rows[0].phone!;
  const customerName  = custRes.rows[0].name;

  // Tailoring orders don't have a warehouse picker in the wizard — resolve one
  // server-side (needed so the real GST invoice created later has a valid
  // invoices.warehouse_id, which is NOT NULL).
  let orderWarehouseId = session.role === 'staff' ? session.warehouseId : null;
  if (!orderWarehouseId) {
    const whRes = await query<{ id: string }>(
      `SELECT id FROM warehouses WHERE is_active=TRUE ORDER BY name ASC LIMIT 1`
    );
    orderWarehouseId = whRes.rows[0]?.id ?? null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const vRes = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver
       FROM measurement_versions WHERE customer_id=$1 AND design_id=$2`,
      [customerId, designId]
    );
    const versionNumber = Number(vRes.rows[0].next_ver);

    const mvRes = await client.query(
      `INSERT INTO measurement_versions (customer_id, design_id, version_number, taken_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [customerId, designId, versionNumber, session.userId]
    );
    const versionId = mvRes.rows[0].id as string;

    for (const [fieldId, value] of Object.entries(measurements)) {
      if (!value.trim()) continue;
      await client.query(
        `INSERT INTO measurement_values (version_id, field_id, value) VALUES ($1,$2,$3)`,
        [versionId, fieldId, value.trim()]
      );
    }

    // group_number = the TO sequence number (shared by all items in a booking session).
    // suffix = A, B, C... appended to group_number to form the full order_number.
    // First order in a session draws a new TO number; subsequent orders reuse it.
    let groupNumber: string;
    let suffix: string;

    if (batchId) {
      const sibRes = await client.query<{ group_number: string; batch_count: string }>(
        `SELECT group_number, COUNT(*)::text AS batch_count
         FROM tailoring_orders WHERE batch_id=$1 AND group_number IS NOT NULL
         GROUP BY group_number LIMIT 1`,
        [batchId]
      );
      if (sibRes.rows[0]) {
        // Reuse the existing TO number — no new sequence draw for subsequent items
        groupNumber = sibRes.rows[0].group_number;
        suffix = String.fromCharCode(65 + parseInt(sibRes.rows[0].batch_count, 10));
      } else {
        // First item in this batch — draw a new TO number
        groupNumber = await nextInvoiceNumber('TO', client);
        suffix = 'A';
      }
    } else {
      // Solo order — still draws its own TO number, gets suffix A
      groupNumber = await nextInvoiceNumber('TO', client);
      suffix = 'A';
    }

    // Full unique identifier stored in order_number: e.g. "TO/2026-27/0029-A"
    const orderNumber = `${groupNumber}-${suffix}`;

    const ordRes = await client.query(
      `INSERT INTO tailoring_orders
         (order_number, customer_id, design_id, measurement_version_id,
          color_fabric, price, total_amount, due_date, notes, created_by, invoice_id,
          customer_name_snapshot, customer_phone_snapshot, batch_id,
          group_number, suffix, warehouse_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [
        orderNumber, customerId, designId, versionId,
        colorFabric || null, price, price,
        dueDate || null, notes || null, session.userId,
        invoiceId || null,
        customerName, customerPhone,
        batchId || null,
        groupNumber, suffix, orderWarehouseId,
      ]
    );

    const newOrderId = ordRes.rows[0].id as string;

    // Optional advance payment collected at booking time.
    if (advanceAmount && advanceAmount > 0 && advancePaymentMode) {
      await client.query(
        `INSERT INTO tailoring_payments (tailoring_order_id, amount, payment_mode, recorded_by)
         VALUES ($1,$2,$3,$4)`,
        [newOrderId, advanceAmount, advancePaymentMode, session.userId]
      );
      await client.query(
        `UPDATE tailoring_orders SET amount_paid=$1 WHERE id=$2`,
        [advanceAmount, newOrderId]
      );
    }

    await client.query('COMMIT');

    logAudit({ userId: session.userId, action: 'create', entityType: 'tailoring_order', entityId: newOrderId, entityLabel: orderNumber }).catch(() => {});

    if (!suppressWhatsApp) {
      const dueDateFormatted = dueDate
        ? `${dueDate.slice(8, 10)}/${dueDate.slice(5, 7)}/${dueDate.slice(0, 4)}`
        : 'TBD';
      const _groupNumber = groupNumber;
      Promise.resolve().then(async () => {
        const pdfPath = await generateTailoringCustomerPdf(newOrderId).catch(() => null);
        sendWhatsAppTemplate(customerPhone, 'sutra_order_confirmation', [
          customerName, _groupNumber, dueDateFormatted,
        ], pdfPath).catch((e) => console.error('[createTailoringOrder] WhatsApp failed:', e));

        // Proforma (estimate) — separate message, not a real tax invoice, no
        // ledger entry. Reuses the generic invoice-notification template since
        // no Meta-approved "proforma" template exists.
        const proformaPath = await generateTailoringProformaPdf(newOrderId).catch(() => null);
        if (proformaPath) {
          sendWhatsAppTemplate(customerPhone, 'sutra_invoice_notification', [
            customerName, `${_groupNumber} (Proforma)`, price.toFixed(2),
          ], proformaPath).catch((e) => console.error('[createTailoringOrder] proforma WhatsApp failed:', e));
        }
      });
    }

    return { success: true, orderId: newOrderId };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createTailoringOrder]', err);
    return { success: false, error: 'Failed to save order. Please try again.' };
  } finally {
    client.release();
  }
}

// ── Send batch confirmation (called after final "Save Order" in a batch) ──

export async function sendBatchConfirmationAction(batchId: string): Promise<void> {
  try {
    const res = await query<{
      id: string; phone: string | null; name: string; order_number: string;
      group_number: string | null; due_date: string | null;
    }>(
      `SELECT o.id, c.phone, c.name, o.order_number, o.group_number, o.due_date::text
       FROM tailoring_orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.batch_id = $1
       ORDER BY o.created_at ASC
       LIMIT 1`,
      [batchId]
    );
    const first = res.rows[0];
    if (!first?.phone) return;

    const dueDateFormatted = first.due_date
      ? `${first.due_date.slice(8, 10)}/${first.due_date.slice(5, 7)}/${first.due_date.slice(0, 4)}`
      : 'TBD';

    // grouped PDF — generateTailoringCustomerPdf auto-collects all group siblings
    const pdfPath = await generateTailoringCustomerPdf(first.id).catch(() => null);
    const displayRef = first.group_number ?? first.order_number;
    await sendWhatsAppTemplate(first.phone, 'sutra_order_confirmation', [
      first.name, displayRef, dueDateFormatted,
    ], pdfPath);
  } catch (e) {
    console.error('[sendBatchConfirmationAction] failed:', e);
  }
}

// ── Create Customer Inline (from wizard Step 2) ────────────────────────────

export async function createCustomerInline(data: { name: string; phone: string }): Promise<{
  success: boolean;
  customer?: { id: string; name: string; phone: string };
  error?: string;
}> {
  await requireRole('admin', 'staff');

  const name  = (data.name ?? '').trim();
  const phone = (data.phone ?? '').trim();

  if (!name)  return { success: false, error: 'Name is required.' };
  if (!phone) return { success: false, error: 'Phone is required for tailoring orders.' };
  if (phone.replace(/\D/g, '').length < 10)
    return { success: false, error: 'Enter a valid 10-digit phone number.' };

  const res = await query(
    `INSERT INTO customers (name, phone) VALUES ($1,$2) RETURNING id, name, phone`,
    [name, phone]
  );
  const c = res.rows[0];
  return { success: true, customer: { id: c.id, name: c.name, phone: c.phone } };
}

// ── Advance Status (in_progress -> ready_for_pickup ONLY) ───────────────────
// 'delivered' can never be reached through this generic action — only via the
// two explicit mark-delivered actions below (Paid / On Credit), so a plain
// status change can never bypass the payment/credit decision.

const NEXT_ALLOWED: Partial<Record<TailoringStatus, TailoringStatus>> = {
  in_progress: 'ready_for_pickup',
};

export async function advanceStatusAction(
  orderId: string,
  newStatus: TailoringStatus
): Promise<{ success: boolean; waStatus: 'sent' | 'skipped' | 'failed'; message: string; error?: string }> {
  const session = await requireRole('admin', 'staff');

  const curRes = await query<{ status: TailoringStatus }>(
    `SELECT status FROM tailoring_orders WHERE id=$1`, [orderId]
  );
  const current = curRes.rows[0]?.status;
  if (!current || NEXT_ALLOWED[current] !== newStatus) {
    return { success: false, waStatus: 'skipped', message: 'Invalid status transition.', error: 'Invalid status transition.' };
  }

  await query(
    `UPDATE tailoring_orders SET status=$1, updated_at=NOW() WHERE id=$2`,
    [newStatus, orderId]
  );
  revalidatePath(`/tailoring/${orderId}`);
  revalidatePath('/tailoring/production');
  revalidatePath('/tailoring');

  // Real GST tax invoice: created once, on the FIRST arrival at ready_for_pickup.
  // If the order was later altered and is returning to ready_for_pickup again,
  // amend the existing invoice in place (if still within the edit grace window)
  // rather than creating a second one — see lib/tailoring-invoice.ts for the
  // full amend/lock rules.
  let newOrAmendedInvoice: { invoiceId: string; invoiceNumber: string } | null = null;
  if (newStatus === 'ready_for_pickup') {
    const invRes = await query<{ invoice_id: string | null }>(
      `SELECT invoice_id FROM tailoring_orders WHERE id=$1`, [orderId]
    );
    if (!invRes.rows[0]?.invoice_id) {
      newOrAmendedInvoice = await createTailoringInvoice(orderId, session.userId);
    } else {
      // Both 'amended_in_place' (in-window correction) and
      // 'supplementary_invoice_created' (locked root -> new delta-only
      // invoice) carry a real invoice to send over WhatsApp below.
      // 'unchanged' / 'locked_flagged' / 'no_invoice' send nothing extra.
      const sync = await syncTailoringInvoiceAfterAlteration(orderId, session.userId);
      if ((sync.action === 'amended_in_place' || sync.action === 'supplementary_invoice_created') && sync.invoiceId && sync.invoiceNumber) {
        newOrAmendedInvoice = { invoiceId: sync.invoiceId, invoiceNumber: sync.invoiceNumber };
      }
    }
  }

  const { rows } = await query<{ phone: string | null }>(
    `SELECT c.phone FROM tailoring_orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=$1`,
    [orderId]
  );
  if (!rows[0]?.phone) {
    return { success: true, waStatus: 'skipped', message: 'Status updated. Customer has no phone.' };
  }

  await sendReadyForPickupWhatsApp(orderId);

  // Separate message carrying the actual GST tax invoice PDF — only sent when
  // a new invoice was just created or an existing one was just amended.
  if (newOrAmendedInvoice) {
    const custRes = await query<{ name: string; grand_total: string }>(
      `SELECT c.name, i.grand_total::text FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.id=$1`,
      [newOrAmendedInvoice.invoiceId]
    );
    if (custRes.rows[0]) {
      const pdfPath = await generateInvoicePdf(newOrAmendedInvoice.invoiceId).catch(() => null);
      sendWhatsAppTemplate(rows[0].phone!, 'sutra_invoice_notification', [
        custRes.rows[0].name, newOrAmendedInvoice.invoiceNumber, Number(custRes.rows[0].grand_total).toFixed(2),
      ], pdfPath).catch((e) => console.error('[advanceStatusAction] invoice WhatsApp failed:', e));
    }
  }

  return { success: true, waStatus: 'sent', message: '✅ Status updated. WhatsApp sent to customer.' };
}

// ── Mark Delivered (Paid) — only when balance due is fully settled ─────────

export async function markDeliveredPaidAction(orderId: string): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  const res = await query<{ status: TailoringStatus; total_amount: string; amount_paid: string }>(
    `SELECT status, total_amount, amount_paid FROM tailoring_orders WHERE id=$1`, [orderId]
  );
  const order = res.rows[0];
  if (!order) return { success: false, error: 'Order not found.' };
  if (order.status !== 'ready_for_pickup') {
    return { success: false, error: 'Order must be ready for pickup before it can be marked delivered.' };
  }
  const balance = Math.round((Number(order.total_amount) - Number(order.amount_paid)) * 100) / 100;
  if (balance > 0) {
    return { success: false, error: `Balance of ₹${balance.toFixed(2)} is still due — use "Mark Delivered (On Credit)" or collect payment first.` };
  }

  await query(
    `UPDATE tailoring_orders SET status='delivered', delivered_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [orderId]
  );
  logAudit({ userId: session.userId, action: 'stage_change', entityType: 'tailoring_order', entityId: orderId, newValue: { status: 'delivered', paid_in_full: true } }).catch(() => {});

  revalidatePath(`/tailoring/${orderId}`);
  revalidatePath('/tailoring/production');
  revalidatePath('/tailoring');

  sendDeliveredWhatsApp(orderId).catch(() => {});

  return { success: true };
}

// ── Mark Delivered (On Credit) — allowed with an outstanding balance ───────

export async function markDeliveredOnCreditAction(orderId: string): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  const res = await query<{ status: TailoringStatus; total_amount: string; amount_paid: string; order_number: string; customer_id: string }>(
    `SELECT status, total_amount, amount_paid, order_number, customer_id FROM tailoring_orders WHERE id=$1`, [orderId]
  );
  const order = res.rows[0];
  if (!order) return { success: false, error: 'Order not found.' };
  if (order.status !== 'ready_for_pickup') {
    return { success: false, error: 'Order must be ready for pickup before it can be marked delivered.' };
  }
  const balance = Math.max(0, Math.round((Number(order.total_amount) - Number(order.amount_paid)) * 100) / 100);

  if (balance > 0) {
    await query(
      `UPDATE tailoring_orders
       SET status='delivered', delivered_at=NOW(), updated_at=NOW(),
           credit_amount = credit_amount + $1, credited_at = NOW()
       WHERE id=$2`,
      [balance, orderId]
    );
  } else {
    await query(
      `UPDATE tailoring_orders SET status='delivered', delivered_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [orderId]
    );
  }

  logAudit({
    userId: session.userId, action: 'stage_change', entityType: 'tailoring_order', entityId: orderId,
    entityLabel: order.order_number, newValue: { status: 'delivered', delivered_on_credit: true, credit_amount: balance },
  }).catch(() => {});

  revalidatePath(`/tailoring/${orderId}`);
  revalidatePath('/tailoring/production');
  revalidatePath('/tailoring');
  revalidatePath(`/customers/${order.customer_id}`);
  revalidatePath('/reports/customer-dues');

  sendDeliveredWhatsApp(orderId).catch(() => {});

  return { success: true };
}

// ── Request Alteration — reopens a ready-for-pickup/delivered order ────────
// Note: tailor_id is deliberately left untouched here, so a reopened order with
// a tailor already assigned lands directly in "In Production" (not "Unassigned")
// on the board — that split is driven purely by tailor_id presence.

export async function requestAlterationAction(data: {
  orderId: string;
  description: string;
  priceAdjustment: number;
  measurements: Record<string, string>;
}): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  const description = data.description.trim();
  if (!description) return { success: false, error: 'Describe what changed.' };

  const res = await query<{
    status: TailoringStatus; order_number: string; group_number: string | null;
    customer_id: string; design_id: string;
    customer_name: string; customer_phone: string | null; design_name: string;
  }>(
    `SELECT o.status, o.order_number, o.group_number, o.customer_id, o.design_id,
            c.name AS customer_name, c.phone AS customer_phone, d.name AS design_name
     FROM tailoring_orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN designs d ON d.id = o.design_id
     WHERE o.id=$1`,
    [data.orderId]
  );
  const order = res.rows[0];
  if (!order) return { success: false, error: 'Order not found.' };
  if (!['ready_for_pickup', 'delivered'].includes(order.status)) {
    return { success: false, error: 'Alterations can only be requested once stitching is done.' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Alterations always log a fresh measurement version (never overwrite
    // history), same convention as updateOrderAction's normal edit flow.
    const vRes = await client.query<{ next_ver: string }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver
       FROM measurement_versions WHERE customer_id=$1 AND design_id=$2`,
      [order.customer_id, order.design_id]
    );
    const versionNumber = Number(vRes.rows[0].next_ver);

    const mvRes = await client.query<{ id: string }>(
      `INSERT INTO measurement_versions (customer_id, design_id, version_number, taken_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [order.customer_id, order.design_id, versionNumber, session.userId]
    );
    const versionId = mvRes.rows[0].id;

    for (const [fieldId, value] of Object.entries(data.measurements)) {
      if (!value.trim()) continue;
      await client.query(
        `INSERT INTO measurement_values (version_id, field_id, value) VALUES ($1,$2,$3)`,
        [versionId, fieldId, value.trim()]
      );
    }

    await client.query(
      `INSERT INTO tailoring_alterations (tailoring_order_id, description, price_adjustment, requested_by, measurement_version_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [data.orderId, description, data.priceAdjustment, session.userId, versionId]
    );

    await client.query(
      `UPDATE tailoring_orders
       SET status='in_progress', total_amount = total_amount + $1, measurement_version_id=$2, updated_at=NOW()
       WHERE id=$3`,
      [data.priceAdjustment, versionId, data.orderId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[requestAlterationAction]', err);
    return { success: false, error: 'Failed to save alteration.' };
  } finally {
    client.release();
  }

  logAudit({
    userId: session.userId, action: 'update', entityType: 'tailoring_order', entityId: data.orderId,
    entityLabel: order.order_number, newValue: { alteration: description, price_adjustment: data.priceAdjustment },
  }).catch(() => {});

  if (order.customer_phone) {
    const displayRef = order.group_number ?? order.order_number;
    sendWhatsAppTemplate(order.customer_phone, 'sutra_order_alteration_started', [
      order.customer_name, displayRef, order.design_name,
    ]).catch((e) => console.error('[requestAlterationAction] alteration-started WA failed:', e));
  }

  revalidatePath(`/tailoring/${data.orderId}`);
  revalidatePath('/tailoring/production');
  revalidatePath('/tailoring');

  return { success: true };
}

// ── Record Payment ──────────────────────────────────────────────────────────

export async function recordTailoringPaymentAction(data: {
  orderId: string;
  amount: number;
  paymentMode: TailoringPaymentMode;
}): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  if (!(data.amount > 0)) return { success: false, error: 'Enter an amount greater than zero.' };

  const res = await query<{ order_number: string }>(
    `SELECT order_number FROM tailoring_orders WHERE id=$1`, [data.orderId]
  );
  if (!res.rows[0]) return { success: false, error: 'Order not found.' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tailoring_payments (tailoring_order_id, amount, payment_mode, recorded_by)
       VALUES ($1,$2,$3,$4)`,
      [data.orderId, data.amount, data.paymentMode, session.userId]
    );

    await client.query(
      `UPDATE tailoring_orders SET amount_paid = amount_paid + $1, updated_at=NOW() WHERE id=$2`,
      [data.amount, data.orderId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[recordTailoringPaymentAction]', err);
    return { success: false, error: 'Failed to record payment.' };
  } finally {
    client.release();
  }

  logAudit({
    userId: session.userId, action: 'payment', entityType: 'tailoring_order', entityId: data.orderId,
    entityLabel: res.rows[0].order_number, newValue: { amount: data.amount, payment_mode: data.paymentMode },
  }).catch(() => {});

  revalidatePath(`/tailoring/${data.orderId}`);
  revalidatePath('/tailoring');

  return { success: true };
}

// ── Assign Tailor ─────────────────────────────────────────────────────────────

export async function assignTailorAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole('admin', 'staff');

  const orderId  = formData.get('order_id')  as string | null;
  const tailorId = formData.get('tailor_id') as string | null;
  if (!orderId || !tailorId) return { success: false, error: 'Missing order or tailor ID' };

  const [orderRes, tailorRes] = await Promise.all([
    query<{
      order_number: string; group_number: string | null; suffix: string | null;
      due_date: string | null;
      customer_name: string; customer_phone: string | null;
      design_name: string; batch_id: string | null;
    }>(
      `SELECT o.order_number, o.group_number, o.suffix, o.due_date::text,
              c.name AS customer_name, c.phone AS customer_phone,
              d.name AS design_name, o.batch_id
       FROM tailoring_orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN designs d ON d.id = o.design_id
       WHERE o.id=$1`,
      [orderId]
    ),
    query<{ name: string; phone: string | null }>(
      `SELECT name, phone FROM tailors WHERE id=$1`, [tailorId]
    ),
  ]);

  if (!orderRes.rows[0] || !tailorRes.rows[0]) {
    return { success: false, error: 'Order or tailor not found' };
  }

  const order  = orderRes.rows[0];
  const tailor = tailorRes.rows[0];

  await query(
    `UPDATE tailoring_orders SET tailor_id=$1, updated_at=NOW() WHERE id=$2`,
    [tailorId, orderId]
  );
  logAudit({ userId: session.userId, action: 'update', entityType: 'tailoring_order', entityId: orderId, entityLabel: order.order_number, newValue: { tailor_id: tailorId, tailor_name: tailor.name } }).catch(() => {});

  revalidatePath('/tailoring/production');
  revalidatePath('/tailoring');
  revalidatePath(`/tailoring/${orderId}`);

  Promise.resolve().then(async () => {
    try {
      const [customerPdf, tailorPdf] = await Promise.all([
        generateTailoringCustomerPdf(orderId),
        generateTailoringTailorPdf(orderId),
      ]);

      const dueDateStr = order.due_date
        ? new Date(order.due_date).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
          })
        : 'TBD';

      const custDisplayRef   = order.group_number ?? order.order_number;
      const tailorDisplayRef = order.group_number && order.suffix
        ? `${order.group_number}${order.suffix}` : order.order_number;

      // For batch orders, skip the per-order "order updated" customer WA — the customer
      // already received ONE batch confirmation at creation time.
      if (order.customer_phone && !order.batch_id) {
        sendWhatsAppTemplate(
          order.customer_phone,
          'sutra_order_updated',
          [order.customer_name, custDisplayRef, dueDateStr],
          customerPdf ?? null
        ).catch((e: unknown) => console.error('[assignTailor] customer WA:', e));
      }

      if (tailor.phone) {
        sendWhatsAppTemplate(
          tailor.phone,
          'sutra_tailor_assignment',
          [tailorDisplayRef, order.design_name, dueDateStr],
          tailorPdf ?? null
        ).catch((e: unknown) => console.error('[assignTailor] tailor WA:', e));
      }
    } catch (e) {
      console.error('[assignTailor] PDF/WA error:', e);
    }
  });

  return { success: true };
}

export async function deleteOrderAction(formData: FormData) {
  const session = await requireRole('admin');
  const id = formData.get('id') as string;
  const numRes = await query<{ order_number: string }>('SELECT order_number FROM tailoring_orders WHERE id=$1', [id]);
  await query('DELETE FROM tailoring_orders WHERE id=$1', [id]);
  logAudit({ userId: session.userId, action: 'delete', entityType: 'tailoring_order', entityId: id, entityLabel: numRes.rows[0]?.order_number }).catch(() => {});
  revalidatePath('/tailoring');
  redirect('/tailoring');
}

// ── Edit Order (measurements + details + price, only while in_progress) ────

export async function updateOrderAction(data: {
  orderId: string;
  measurements: Record<string, string>;
  colorFabric?: string;
  notes?: string;
  dueDate?: string | null;
  totalAmount?: number;
}): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  const orderRes = await query<{
    status: TailoringStatus; customer_id: string; design_id: string;
    old_due_date: string | null;
    customer_phone: string | null; customer_name: string;
    order_number: string; group_number: string | null;
  }>(
    `SELECT o.status, o.customer_id, o.design_id, o.due_date::text AS old_due_date,
            o.order_number, o.group_number,
            c.phone AS customer_phone, c.name AS customer_name
     FROM tailoring_orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id=$1`,
    [data.orderId]
  );

  const order = orderRes.rows[0];
  if (!order) return { success: false, error: 'Order not found' };
  if (order.status !== 'in_progress') {
    return { success: false, error: 'Order cannot be edited at this status.' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const vRes = await client.query<{ next_ver: string }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver
       FROM measurement_versions WHERE customer_id=$1 AND design_id=$2`,
      [order.customer_id, order.design_id]
    );
    const versionNumber = Number(vRes.rows[0].next_ver);

    const mvRes = await client.query<{ id: string }>(
      `INSERT INTO measurement_versions (customer_id, design_id, version_number, taken_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [order.customer_id, order.design_id, versionNumber, session.userId]
    );
    const versionId = mvRes.rows[0].id;

    for (const [fieldId, value] of Object.entries(data.measurements)) {
      if (!value.trim()) continue;
      await client.query(
        `INSERT INTO measurement_values (version_id, field_id, value) VALUES ($1,$2,$3)`,
        [versionId, fieldId, value.trim()]
      );
    }

    if (data.totalAmount !== undefined) {
      await client.query(
        `UPDATE tailoring_orders
         SET measurement_version_id=$1, color_fabric=$2, notes=$3, due_date=$4, total_amount=$5, updated_at=NOW()
         WHERE id=$6`,
        [versionId, data.colorFabric || null, data.notes || null, data.dueDate || null, data.totalAmount, data.orderId]
      );
    } else {
      await client.query(
        `UPDATE tailoring_orders
         SET measurement_version_id=$1, color_fabric=$2, notes=$3, due_date=$4, updated_at=NOW()
         WHERE id=$5`,
        [versionId, data.colorFabric || null, data.notes || null, data.dueDate || null, data.orderId]
      );
    }

    await client.query('COMMIT');

    if (order.customer_phone) {
      const phone = order.customer_phone;
      const newDueDate = data.dueDate ?? null;
      Promise.resolve().then(async () => {
        const dateStr = newDueDate
          ? `${newDueDate.slice(8, 10)}/${newDueDate.slice(5, 7)}/${newDueDate.slice(0, 4)}`
          : 'TBD';
        const pdfPath = await generateTailoringCustomerPdf(data.orderId).catch(() => null);
        const displayRef = order.group_number ?? order.order_number;
        sendWhatsAppTemplate(phone, 'sutra_order_updated', [
          order.customer_name, displayRef, dateStr,
        ], pdfPath).catch((e) => console.error('[updateOrderAction] WA failed:', e));
      });
    }

    logAudit({ userId: session.userId, action: 'update', entityType: 'tailoring_order', entityId: data.orderId, entityLabel: order.order_number }).catch(() => {});
    revalidatePath(`/tailoring/${data.orderId}`);
    revalidatePath('/tailoring');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateOrderAction]', err);
    return { success: false, error: 'Failed to save changes.' };
  } finally {
    client.release();
  }
}

// ── Change Tailor (notifies old + new tailor) ─────────────────────────────

export async function changeTailorAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole('admin', 'staff');

  const orderId  = formData.get('order_id')  as string | null;
  const tailorId = formData.get('tailor_id') as string | null;
  if (!orderId || !tailorId) return { success: false, error: 'Missing data' };

  const [newTailorRes, currentOrderRes] = await Promise.all([
    query<{ name: string; phone: string | null }>(`SELECT name, phone FROM tailors WHERE id=$1`, [tailorId]),
    query<{ order_number: string; group_number: string | null; suffix: string | null; tailor_id: string | null }>(
      `SELECT order_number, group_number, suffix, tailor_id FROM tailoring_orders WHERE id=$1`, [orderId]
    ),
  ]);
  if (!newTailorRes.rows[0]) return { success: false, error: 'Tailor not found' };
  const newTailor = newTailorRes.rows[0];
  const currentOrder = currentOrderRes.rows[0];

  let oldTailorName: string | null = null;
  let oldTailorPhone: string | null = null;
  if (currentOrder?.tailor_id && currentOrder.tailor_id !== tailorId) {
    const oldRes = await query<{ name: string; phone: string | null }>(
      `SELECT name, phone FROM tailors WHERE id=$1`, [currentOrder.tailor_id]
    );
    if (oldRes.rows[0]) {
      oldTailorName = oldRes.rows[0].name;
      oldTailorPhone = oldRes.rows[0].phone;
    }
  }

  await query(`UPDATE tailoring_orders SET tailor_id=$1, updated_at=NOW() WHERE id=$2`, [tailorId, orderId]);
  logAudit({ userId: session.userId, action: 'update', entityType: 'tailoring_order', entityId: orderId, entityLabel: currentOrder?.order_number, newValue: { tailor_id: tailorId, tailor_name: newTailor.name } }).catch(() => {});
  revalidatePath(`/tailoring/${orderId}`);
  revalidatePath('/tailoring/production');

  Promise.resolve().then(async () => {
    try {
      const oldTailorDisplayRef = currentOrder?.group_number && currentOrder?.suffix
        ? `${currentOrder.group_number}${currentOrder.suffix}` : currentOrder?.order_number;

      if (oldTailorPhone && oldTailorName && oldTailorDisplayRef) {
        sendWhatsAppTemplate(oldTailorPhone, 'sutra_tailor_removed', [
          oldTailorName, oldTailorDisplayRef,
        ]).catch((e: unknown) => console.error('[changeTailor] old tailor WA:', e));
      }

      if (newTailor.phone) {
        const [tailorPdf, detailRes] = await Promise.all([
          generateTailoringTailorPdf(orderId).catch(() => null),
          query<{ order_number: string; group_number: string | null; suffix: string | null; due_date: string | null; design_name: string }>(
            `SELECT o.order_number, o.group_number, o.suffix, o.due_date::text, d.name AS design_name
             FROM tailoring_orders o
             JOIN designs d ON d.id = o.design_id
             WHERE o.id=$1`, [orderId]
          ),
        ]);
        const detail = detailRes.rows[0];
        if (detail) {
          const dueDateStr = detail.due_date
            ? new Date(detail.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'TBD';
          const tailorDisplayRef = detail.group_number && detail.suffix
            ? `${detail.group_number}${detail.suffix}` : detail.order_number;
          sendWhatsAppTemplate(newTailor.phone, 'sutra_tailor_assignment', [
            tailorDisplayRef, detail.design_name, dueDateStr,
          ], tailorPdf ?? null).catch((e: unknown) => console.error('[changeTailor] new tailor WA:', e));
        }
      }
    } catch (e) {
      console.error('[changeTailor] WA error:', e);
    }
  });

  return { success: true };
}
