'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { nextInvoiceNumber } from '@/lib/invoice-number';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { generateTailoringCustomerPdf, generateTailoringTailorPdf, generateBatchTailoringPdf } from '@/lib/pdf-generator';
import { logAudit } from '@/lib/audit';
import type { ActionResult } from '@/types';
import type { TailoringStage } from '@/types';

// ── Batch notification helpers ─────────────────────────────────────────────

// Returns true only when every order in the batch has reached requiredStage or beyond.
// passedStages: stages that count as "already past" the threshold (e.g. 'delivered' counts as past 'ready').
async function isBatchFullyAt(batchId: string, requiredStage: TailoringStage, passedStages: TailoringStage[]): Promise<boolean> {
  const allowed = [requiredStage, ...passedStages].map((s) => `'${s}'`).join(', ');
  const res = await query<{ pending: string }>(
    `SELECT COUNT(*) FILTER (WHERE stage NOT IN (${allowed})) AS pending
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
    invoiceId, batchId, suppressWhatsApp,
  } = parsed.data;

  const custRes = await query<{ phone: string | null; name: string }>(
    'SELECT phone, name FROM customers WHERE id=$1', [customerId]
  );
  if (!custRes.rows[0]?.phone) {
    return { success: false, error: 'Customer must have a phone number for tailoring orders.' };
  }
  const customerPhone = custRes.rows[0].phone!;
  const customerName  = custRes.rows[0].name;

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
          color_fabric, price, due_date, notes, created_by, invoice_id,
          customer_name_snapshot, customer_phone_snapshot, batch_id,
          group_number, suffix)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [
        orderNumber, customerId, designId, versionId,
        colorFabric || null, price,
        dueDate || null, notes || null, session.userId,
        invoiceId || null,
        customerName, customerPhone,
        batchId || null,
        groupNumber, suffix,
      ]
    );

    await client.query('COMMIT');

    const newOrderId = ordRes.rows[0].id as string;
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

// ── Update Stage ───────────────────────────────────────────────────────────

const STAGE_ORDER: TailoringStage[] = ['placed', 'production', 'ready', 'delivered'];

export async function updateStageAction(formData: FormData) {
  const session = await requireRole('admin', 'staff');

  const orderId  = formData.get('order_id') as string;
  const newStage = formData.get('stage') as TailoringStage;

  if (!STAGE_ORDER.includes(newStage)) return;

  await query(
    `UPDATE tailoring_orders SET stage=$1, updated_at=NOW() WHERE id=$2`,
    [newStage, orderId]
  );
  logAudit({ userId: session.userId, action: 'stage_change', entityType: 'tailoring_order', entityId: orderId, newValue: { stage: newStage } }).catch(() => {});

  if (newStage === 'ready' || newStage === 'delivered') {
    Promise.resolve().then(async () => {
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
          // Single order — send immediately
          if (newStage === 'ready') {
            const pdfPath = await generateTailoringCustomerPdf(orderId).catch(() => null);
            sendWhatsAppTemplate(r.phone, 'sutra_order_ready', [r.name, displayRef], pdfPath)
              .catch((e) => console.error('[updateStageAction] sutra_order_ready WA failed:', e));
          } else {
            sendWhatsAppTemplate(r.phone, 'sutra_order_delivered', [r.name, displayRef])
              .catch((e) => console.error('[updateStageAction] sutra_order_delivered WA failed:', e));
          }
          return;
        }

        // Batch order — only send when ALL siblings are at this stage or beyond
        const allReady     = newStage === 'ready' ? await isBatchFullyAt(r.batch_id, 'ready', ['delivered']) : false;
        const allDelivered = newStage === 'delivered' ? await isBatchFullyAt(r.batch_id, 'delivered', []) : false;

        if (newStage === 'ready' && !allReady) {
          console.log(`[updateStageAction] Batch ${r.batch_id}: holding ready WA — siblings still in progress`);
          return;
        }
        if (newStage === 'delivered' && !allDelivered) {
          console.log(`[updateStageAction] Batch ${r.batch_id}: holding delivered WA — siblings not yet delivered`);
          return;
        }

        // All batch orders at threshold — send ONE message using group_number as reference
        const first = await batchFirstOrder(r.batch_id);
        const batchDisplayRef = first?.group_number ?? first?.order_number ?? displayRef;

        if (newStage === 'ready') {
          const pdfPath = await generateTailoringCustomerPdf(orderId).catch(() => null);
          sendWhatsAppTemplate(r.phone, 'sutra_order_ready', [r.name, batchDisplayRef], pdfPath)
            .catch((e) => console.error('[updateStageAction] batch sutra_order_ready WA failed:', e));
        } else {
          sendWhatsAppTemplate(r.phone, 'sutra_order_delivered', [r.name, batchDisplayRef])
            .catch((e) => console.error('[updateStageAction] batch sutra_order_delivered WA failed:', e));
        }
      } catch (e) {
        console.error('[updateStageAction] DB query failed:', e);
      }
    });
  }

  revalidatePath(`/tailoring/${orderId}`);
  revalidatePath('/tailoring/production');
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
    `UPDATE tailoring_orders SET tailor_id=$1, stage='production', updated_at=NOW() WHERE id=$2`,
    [tailorId, orderId]
  );
  logAudit({ userId: session.userId, action: 'update', entityType: 'tailoring_order', entityId: orderId, entityLabel: order.order_number, newValue: { tailor_id: tailorId, tailor_name: tailor.name } }).catch(() => {});

  revalidatePath('/tailoring/production');
  revalidatePath('/tailoring');

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

// ── Edit Order (measurements + details, preserves stage) ─────────────────────

export async function updateOrderAction(data: {
  orderId: string;
  measurements: Record<string, string>;
  colorFabric?: string;
  notes?: string;
  dueDate?: string | null;
}): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  const orderRes = await query<{
    stage: string; customer_id: string; design_id: string;
    old_due_date: string | null;
    customer_phone: string | null; customer_name: string;
    order_number: string; group_number: string | null;
  }>(
    `SELECT o.stage, o.customer_id, o.design_id, o.due_date::text AS old_due_date,
            o.order_number, o.group_number,
            c.phone AS customer_phone, c.name AS customer_name
     FROM tailoring_orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id=$1`,
    [data.orderId]
  );

  const order = orderRes.rows[0];
  if (!order) return { success: false, error: 'Order not found' };
  if (!['placed', 'production'].includes(order.stage)) {
    return { success: false, error: 'Order cannot be edited at this stage.' };
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

    await client.query(
      `UPDATE tailoring_orders
       SET measurement_version_id=$1, color_fabric=$2, notes=$3, due_date=$4, updated_at=NOW()
       WHERE id=$5`,
      [versionId, data.colorFabric || null, data.notes || null, data.dueDate || null, data.orderId]
    );

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

// ── Advance Stage with WA feedback (for production board) ────────────────────

export async function advanceStageAction(
  orderId: string,
  newStage: TailoringStage
): Promise<{ success: boolean; waStatus: 'sent' | 'skipped' | 'failed'; message: string }> {
  await requireRole('admin', 'staff');

  await query(
    `UPDATE tailoring_orders SET stage=$1, updated_at=NOW() WHERE id=$2`,
    [newStage, orderId]
  );
  revalidatePath(`/tailoring/${orderId}`);
  revalidatePath('/tailoring/production');

  if (newStage !== 'ready' && newStage !== 'delivered') {
    return { success: true, waStatus: 'skipped', message: 'Stage updated.' };
  }

  try {
    const { rows } = await query<{
      phone: string | null; name: string; order_number: string; group_number: string | null; batch_id: string | null;
    }>(
      `SELECT c.phone, c.name, o.order_number, o.group_number, o.batch_id
       FROM tailoring_orders o JOIN customers c ON c.id = o.customer_id WHERE o.id=$1`,
      [orderId]
    );
    const r = rows[0];
    if (!r?.phone) {
      return { success: true, waStatus: 'skipped', message: 'Stage updated. Customer has no phone.' };
    }

    const displayRef = r.group_number ?? r.order_number;

    // Batch logic: hold until all siblings reach the same threshold
    if (r.batch_id) {
      const allReady     = newStage === 'ready'     ? await isBatchFullyAt(r.batch_id, 'ready', ['delivered']) : false;
      const allDelivered = newStage === 'delivered' ? await isBatchFullyAt(r.batch_id, 'delivered', []) : false;
      const allDone = newStage === 'ready' ? allReady : allDelivered;

      if (!allDone) {
        return {
          success: true,
          waStatus: 'skipped',
          message: `Stage updated. Waiting for other items in this batch before sending WhatsApp.`,
        };
      }

      // All batch orders ready/delivered — send ONE message using group_number
      const first = await batchFirstOrder(r.batch_id);
      const batchDisplayRef = first?.group_number ?? first?.order_number ?? displayRef;
      let waRes;
      if (newStage === 'ready') {
        const pdfPath = await generateTailoringCustomerPdf(orderId).catch(() => null);
        waRes = await sendWhatsAppTemplate(r.phone, 'sutra_order_ready', [r.name, batchDisplayRef], pdfPath);
      } else {
        waRes = await sendWhatsAppTemplate(r.phone, 'sutra_order_delivered', [r.name, batchDisplayRef]);
      }
      if (waRes.success) {
        return { success: true, waStatus: 'sent', message: '✅ Stage updated. WhatsApp sent (all batch items complete).' };
      }
      return { success: true, waStatus: 'failed', message: `⚠️ Stage updated. WhatsApp failed — ${waRes.error ?? 'unknown'}` };
    }

    // Single order — send immediately
    let waRes;
    if (newStage === 'ready') {
      const pdfPath = await generateTailoringCustomerPdf(orderId).catch(() => null);
      waRes = await sendWhatsAppTemplate(r.phone, 'sutra_order_ready', [r.name, displayRef], pdfPath);
    } else {
      waRes = await sendWhatsAppTemplate(r.phone, 'sutra_order_delivered', [r.name, displayRef]);
    }

    if (waRes.success) {
      return { success: true, waStatus: 'sent', message: '✅ Stage updated. WhatsApp sent to customer.' };
    }
    return { success: true, waStatus: 'failed', message: `⚠️ Stage updated. WhatsApp failed — ${waRes.error ?? 'unknown'}` };
  } catch (e) {
    console.error('[advanceStageAction] WA error:', e);
    return { success: true, waStatus: 'failed', message: '⚠️ Stage updated. WhatsApp failed.' };
  }
}

// ── Change Tailor (stays in production, notifies old + new tailor) ─────────────

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
