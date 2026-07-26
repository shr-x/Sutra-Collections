'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { calcLine, calcInvoiceTotals } from '@/lib/gst';
import { nextInvoiceNumber } from '@/lib/invoice-number';
import { postSalesInvoice, postPaymentReceived, postJournalEntry } from '@/lib/accounting';
import { sendWhatsAppText, interpolateTemplate, sendWhatsAppTemplate } from '@/lib/whatsapp';
import { getLoyaltyRates, earnPoints, redeemPointsInTransaction } from '@/lib/loyalty';
import { logAudit } from '@/lib/audit';
import { generateThermalInvoicePdf } from '@/lib/pdf-generator';
import { checkLowStockForItems } from '@/lib/low-stock';
import type { ActionResult } from '@/types';

// ─── Schema ───────────────────────────────────────────────────────────────────

const LineItemSchema = z.object({
  item_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  size_id: z.string().uuid().nullable().optional(),
  color_id: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().positive(),
  rate: z.coerce.number().nonnegative(),
  discount_type: z.enum(['flat', 'percent']).nullable().optional(),
  discount_value: z.coerce.number().nonnegative().nullable().optional(),
  hsn_code: z.string().max(10).nullable().optional(),
  gst_rate: z.coerce.number().min(0).max(100),
});

const InvoiceSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  warehouse_id: z.string().uuid(),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  due_date: z.string().optional().nullable(),
  invoice_type: z.enum(['gst', 'non_gst']).default('gst'),
  is_scheme_invoice: z.boolean().default(false),
  payment_mode: z.enum(['cash', 'upi', 'credit', 'card']).nullable().optional(),
  amount_paid: z.coerce.number().nonnegative().default(0),
  invoice_discount_type: z.enum(['flat', 'percent']).nullable().optional(),
  invoice_discount_value: z.coerce.number().nonnegative().nullable().optional(),
  bogo_discount_amount: z.coerce.number().nonnegative().default(0),
  is_recurring: z.boolean().default(false),
  recurring_frequency: z.enum(['weekly', 'monthly']).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  loyalty_points_redeemed: z.coerce.number().int().nonnegative().default(0),
  items: z.array(LineItemSchema).min(1, 'Add at least one item'),
});

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createInvoiceAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  let parsed: z.infer<typeof InvoiceSchema>;
  try {
    const raw = JSON.parse(formData.get('payload') as string);
    parsed = InvoiceSchema.parse(raw);
  } catch (e) {
    return { success: false, error: e instanceof z.ZodError ? e.errors[0].message : 'Invalid data' };
  }

  const { items, invoice_discount_type, invoice_discount_value, bogo_discount_amount, is_scheme_invoice, loyalty_points_redeemed, ...header } = parsed;

  // Calculate line totals
  const lineResults = items.map((item) =>
    calcLine({
      quantity: item.quantity,
      rate: item.rate,
      discountType: item.discount_type ?? null,
      discountValue: item.discount_value ?? 0,
      gstRate: item.gst_rate,
      isScheme: is_scheme_invoice,
    })
  );

  const baseTotals = calcInvoiceTotals(lineResults, {
    discountType: invoice_discount_type ?? null,
    discountValue: invoice_discount_value ?? 0,
  });

  // ── Discount stacking: Grand Total = Subtotal − Scheme − Loyalty (#2) ────────
  // Scheme (BOGO) applies first; loyalty (1 pt = ₹1) is then capped at the
  // POST-SCHEME total so it can never over-discount.
  const postSchemeTotal = Math.max(0, baseTotals.grandTotal - bogo_discount_amount);
  const cappedLoyaltyPoints = header.customer_id
    ? Math.min(Math.max(0, loyalty_points_redeemed), Math.floor(postSchemeTotal))
    : 0;
  const loyaltyDiscountAmount = cappedLoyaltyPoints; // 1 pt = ₹1
  const finalGrandTotal = Math.max(0, postSchemeTotal - loyaltyDiscountAmount);

  const totals = {
    ...baseTotals,
    grandTotal: finalGrandTotal,
  };

  // Loyalty already reduced the grand total, so the cash/UPI tendered is NOT
  // increased by it — amount_paid is just the money received.
  const effectiveAmountPaid = Math.min(finalGrandTotal, header.amount_paid);

  // ─── Snapshot customer details at creation time (Issue 2) ────────────────────
  let customerNameSnapshot: string | null = null;
  let customerPhoneSnapshot: string | null = null;
  let customerGstinSnapshot: string | null = null;
  if (header.customer_id) {
    const snapRes = await query<{ name: string; phone: string | null; gstin: string | null }>(
      'SELECT name, phone, gstin FROM customers WHERE id=$1', [header.customer_id]
    );
    if (snapRes.rows[0]) {
      customerNameSnapshot = snapRes.rows[0].name;
      customerPhoneSnapshot = snapRes.rows[0].phone;
      customerGstinSnapshot = snapRes.rows[0].gstin;
    }
  }

  // ─── Credit sale pre-checks (business rules #3 and credit limit) ─────────────
  if (header.payment_mode === 'credit' && header.customer_id) {
    const custRes = await query<{ phone: string | null; credit_limit: string }>(
      `SELECT phone, credit_limit FROM customers WHERE id=$1`, [header.customer_id]
    );
    const cust = custRes.rows[0];
    if (!cust?.phone) {
      return { success: false, error: 'Credit sales require a phone number on file for this customer.' };
    }
    const creditLimit = Number(cust.credit_limit);
    if (creditLimit > 0) {
      const outRes = await query<{ outstanding: string }>(
        `SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS outstanding
         FROM invoices WHERE customer_id=$1 AND status IN ('issued','partially_paid')`,
        [header.customer_id]
      );
      const outstanding = Number(outRes.rows[0].outstanding);
      if (outstanding + totals.grandTotal > creditLimit) {
        return {
          success: false,
          error: `Credit limit exceeded. Outstanding: ₹${outstanding.toFixed(0)}, Limit: ₹${creditLimit.toFixed(0)}, New invoice: ₹${totals.grandTotal.toFixed(0)}.`,
        };
      }
    }
  }

  // ─── Pre-flight: stock check for finished goods ─────────────────────────
  for (const item of items) {
    const typeRow = await query<{ item_type: string; name: string }>(
      'SELECT item_type, name FROM items WHERE id=$1', [item.item_id]
    );
    if (typeRow.rows[0]?.item_type !== 'finished') continue;

    const stockRow = await query<{ quantity: string }>(
      `SELECT COALESCE(SUM(quantity), 0) AS quantity FROM stock
       WHERE item_id=$1 AND warehouse_id=$2
         AND COALESCE(size_id,  (SELECT id FROM item_sizes  WHERE item_id=$1 AND is_default=TRUE LIMIT 1))
             IS NOT DISTINCT FROM COALESCE($3::uuid, (SELECT id FROM item_sizes  WHERE item_id=$1 AND is_default=TRUE LIMIT 1))
         AND COALESCE(color_id, (SELECT id FROM item_colors WHERE item_id=$1 AND is_default=TRUE LIMIT 1))
             IS NOT DISTINCT FROM COALESCE($4::uuid, (SELECT id FROM item_colors WHERE item_id=$1 AND is_default=TRUE LIMIT 1))`,
      [item.item_id, header.warehouse_id, item.size_id ?? null, item.color_id ?? null]
    );
    const available = Number(stockRow.rows[0]?.quantity ?? 0);

    // Hard-block only when we have recorded positive stock and the sale exceeds it
    if (available > 0 && item.quantity > available) {
      return {
        success: false,
        error: `Insufficient stock for "${typeRow.rows[0].name}": ${available} in stock, ${item.quantity} requested.`,
      };
    }
    // available ≤ 0 → zero / untracked stock — warn implicitly, allow the sale
  }

  let invoiceId: string;
  let invoiceNumber = '';
  try {
    // Transaction
    const client = await (await import('@/lib/db')).pool.connect();
    try {
      await client.query('BEGIN');

      invoiceNumber = await nextInvoiceNumber('INV', client);

      // $1=invoice_number $2=invoice_type $3=payment_mode $4=effective_amount_paid $5=grand_total
      // $6=customer_id $7=warehouse_id $8=invoice_date $9=due_date $10=is_scheme
      // $11=is_recurring $12=recurring_frequency $13=disc_type $14=disc_value
      // $15=disc_amount $16=subtotal $17=cgst $18=sgst $19=grand_total $20=notes $21=created_by
      // $22=loyalty_points_redeemed
      const invoiceParams = [
        invoiceNumber,                      // $1
        header.invoice_type,                // $2
        header.payment_mode ?? null,        // $3
        effectiveAmountPaid,                // $4  — includes loyalty discount
        totals.grandTotal,                  // $5
        header.customer_id ?? null,         // $6
        header.warehouse_id,                // $7
        header.invoice_date,                // $8
        header.due_date ?? null,            // $9
        is_scheme_invoice,                  // $10
        header.is_recurring,                // $11
        header.recurring_frequency ?? null, // $12
        invoice_discount_type ?? null,      // $13
        invoice_discount_value ?? null,     // $14
        totals.invoiceDiscountAmount,       // $15
        totals.subtotal,                    // $16
        totals.totalCgst,                   // $17
        totals.totalSgst,                   // $18
        totals.grandTotal,                  // $19
        header.notes ?? null,               // $20
        session.userId,                     // $21
        cappedLoyaltyPoints,                // $22 — loyalty_points_redeemed (capped)
        bogo_discount_amount,               // $23 — scheme_discount_amount
        loyaltyDiscountAmount,             // $24 — loyalty_discount_amount (Rs., 1pt=Rs.1)
        customerNameSnapshot,              // $25
        customerPhoneSnapshot,             // $26
        customerGstinSnapshot,             // $27
      ];

      const invRes = await client.query<{ id: string }>(
        `INSERT INTO invoices (
           invoice_number, invoice_type, status, customer_id, warehouse_id,
           invoice_date, due_date, is_scheme_invoice, is_recurring, recurring_frequency,
           payment_mode, amount_paid,
           invoice_discount_type, invoice_discount_value, invoice_discount_amount,
           subtotal, total_cgst, total_sgst, grand_total, notes, created_by,
           loyalty_points_redeemed, scheme_discount_amount, loyalty_discount_amount,
           customer_name_snapshot, customer_phone_snapshot, customer_gstin_snapshot
         ) VALUES (
           $1,$2,
           CASE WHEN $3 = 'credit' OR ($3 IS NULL AND $4::numeric > 0 AND $4 < $5) THEN 'partially_paid'
                WHEN $4::numeric >= $5::numeric THEN 'paid'
                ELSE 'issued'
           END,
           $6,$7,$8,$9,$10,$11,$12,$3,$4,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
         ) RETURNING id`,
        invoiceParams
      );

      invoiceId = invRes.rows[0].id;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const lr = lineResults[i];
        await client.query(
          `INSERT INTO invoice_items (
             invoice_id, item_id, variant_id, size_id, color_id, sort_order,
             quantity, rate, discount_type, discount_value, discount_amount,
             hsn_code, gst_rate, taxable_value, cgst_amount, sgst_amount, total_amount
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            invoiceId,
            item.item_id,
            item.variant_id ?? null,
            item.size_id ?? null,
            item.color_id ?? null,
            i,
            item.quantity,
            item.rate,
            item.discount_type ?? null,
            item.discount_value ?? null,
            lr.discountAmount,
            item.hsn_code ?? null,
            item.gst_rate,
            lr.taxableValue,
            lr.cgstAmount,
            lr.sgstAmount,
            lr.totalAmount,
          ]
        );

        // Deduct from stock (finished goods)
        const itemTypeRes = await client.query<{ item_type: string }>(
          'SELECT item_type FROM items WHERE id=$1', [item.item_id]
        );
        if (itemTypeRes.rows[0]?.item_type === 'finished') {
          console.log('[STOCK] Deducting', item.quantity, 'for item', item.item_id, 'size_id:', item.size_id ?? null, 'color_id:', item.color_id ?? null, 'wh:', header.warehouse_id);
          // Symmetric COALESCE: resolve NULL → default on BOTH the stored column
          // and the incoming param, so a sale with no variant (NULL) matches a
          // stock row stored as NULL (legacy) or as the default UUID. The old
          // code only coalesced the column, so NULL-param sales matched 0 rows.
          const stockUpd = await client.query(
            `UPDATE stock SET quantity = quantity - $1
             WHERE item_id=$2 AND warehouse_id=$3
               AND COALESCE(size_id,  (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                   IS NOT DISTINCT FROM COALESCE($4::uuid, (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
               AND COALESCE(color_id, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                   IS NOT DISTINCT FROM COALESCE($5::uuid, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))`,
            [item.quantity, item.item_id, header.warehouse_id, item.size_id ?? null, item.color_id ?? null]
          );
          console.log('[STOCK] Rows updated:', stockUpd.rowCount);
          if ((stockUpd.rowCount ?? 0) === 0) {
            // No matching row — diagnose, then create one (negative = oversold)
            const diag = await client.query(
              `SELECT id, size_id, color_id, quantity FROM stock WHERE item_id=$1 AND warehouse_id=$2`,
              [item.item_id, header.warehouse_id]
            );
            console.warn('[STOCK] rowCount=0 — existing rows for item/wh:', JSON.stringify(diag.rows));
            await client.query(
              `INSERT INTO stock (item_id, size_id, color_id, warehouse_id, quantity)
               VALUES ($1,$2,$3,$4,$5)`,
              [item.item_id, item.size_id ?? null, item.color_id ?? null, header.warehouse_id, -item.quantity]
            );
            console.log('[STOCK] Inserted oversold row with quantity', -item.quantity);
          }
          await client.query(
            `INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_id, notes, created_by)
             VALUES ($1,$2,'sale',$3,$4,'Sale invoice',$5)`,
            [item.item_id, header.warehouse_id, item.quantity, invoiceId, session.userId]
          );
        }
      }

      // Redeem loyalty points inside the transaction (use the capped count so we
      // never deduct more points than the discount actually given).
      if (cappedLoyaltyPoints > 0 && header.customer_id) {
        await redeemPointsInTransaction(client, header.customer_id, cappedLoyaltyPoints, invoiceId!);
      }

      // Auto-post accounting journal entry
      try {
        await postSalesInvoice({
          invoiceId: invoiceId!,
          invoiceNumber: invoiceNumber,
          invoiceDate: header.invoice_date,
          grandTotal: totals.grandTotal,
          taxableValue: totals.grandTotal - totals.totalCgst - totals.totalSgst,
          totalCgst: totals.totalCgst,
          totalSgst: totals.totalSgst,
          paymentMode: header.payment_mode ?? null,
          amountPaid: effectiveAmountPaid,
          createdBy: session.userId,
        }, client);
      } catch (acctErr) {
        console.error('Accounting post failed (non-fatal):', acctErr);
      }

      await client.query('COMMIT');

      // Earn loyalty points only for immediately-paid invoices (credit invoices earn on actual payment).
      // grand_total is already net of scheme + loyalty, so earn on it directly.
      if (header.customer_id && header.payment_mode !== 'credit' && effectiveAmountPaid >= totals.grandTotal) {
        const rates = await getLoyaltyRates();
        const earnBase = Math.max(0, totals.grandTotal);
        await earnPoints(header.customer_id, earnBase, invoiceId!, rates.earnRate);
      }

      // Audit log
      await logAudit({
        userId: session.userId,
        action: 'create',
        entityType: 'invoice',
        entityId: invoiceId!,
        entityLabel: invoiceNumber,
        newValue: { grandTotal: totals.grandTotal, customerId: header.customer_id },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to save invoice. Please try again.' };
  }

  // Generate thermal PDF for WhatsApp (fire-and-forget, non-blocking)
  const pdfPath = await generateThermalInvoicePdf(invoiceId!).catch(() => null);

  // Low-stock check after stock deductions (fire-and-forget)
  const soldItemIds = parsed.items.map((i) => i.item_id);
  checkLowStockForItems(soldItemIds).catch(() => {});

  // WhatsApp notification — sutra_invoice_notification with PDF attached
  // {{1}}=name {{2}}=invoice# {{3}}=amount (template body already reads "Amount: Rs.{{3}}" — send the bare number)
  let waResult: 'sent' | 'failed' | 'skip' = 'skip';
  let waError = '';
  if (header.customer_id) {
    try {
      const custRes = await query<{ name: string; phone: string | null }>(
        'SELECT name, phone FROM customers WHERE id=$1', [header.customer_id]
      );
      const cust = custRes.rows[0];
      const phone = cust?.phone;
      if (phone) {
        const amount = totals.grandTotal.toFixed(2);
        const waSent = await sendWhatsAppTemplate(
          phone,
          'sutra_invoice_notification',
          [cust.name ?? 'Customer', invoiceNumber, amount],
          pdfPath
        );
        waResult = waSent.success ? 'sent' : 'failed';
        if (!waSent.success) {
          waError = waSent.error ?? 'unknown error';
          console.warn(`[WhatsApp] Send failed for ${invoiceNumber}: ${waError}`);
        }

        // Credit invoices: append a UPI pay link text
        if (header.payment_mode === 'credit') {
          const upiVpa = process.env.UPI_VPA ?? 'sutra@upi';
          const due = (totals.grandTotal - effectiveAmountPaid).toFixed(2);
          sendWhatsAppText(
            phone,
            `Payment due: Rs.${due}. Pay here: upi://pay?pa=${upiVpa}&am=${due}&tn=${invoiceNumber}`
          ).catch(() => {});
        }
      }
    } catch (err) {
      waResult = 'failed';
      waError = (err as Error).message ?? 'unknown error';
    }
  }

  const waQuery = waResult === 'failed' && waError
    ? `?wa=failed&reason=${encodeURIComponent(waError)}`
    : `?wa=${waResult}`;
  redirect(`/billing/invoices/${invoiceId!}${waQuery}`);
}

// ─── Update (1-hour grace window) ─────────────────────────────────────────────

export async function updateInvoiceAction(
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  // Check grace window
  const existing = await query<{ created_at: Date; status: string }>(
    'SELECT created_at, status FROM invoices WHERE id=$1', [id]
  );
  if (!existing.rows[0]) return { success: false, error: 'Invoice not found' };

  const { created_at, status } = existing.rows[0];
  const ageMs = Date.now() - new Date(created_at).getTime();
  if (status === 'cancelled') return { success: false, error: 'Cannot edit a cancelled invoice' };
  if (status !== 'draft' && ageMs > 60 * 60 * 1000) {
    return { success: false, error: 'Edits are only allowed within 1 hour of issuing' };
  }

  let parsed: z.infer<typeof InvoiceSchema>;
  try {
    const raw = JSON.parse(formData.get('payload') as string);
    parsed = InvoiceSchema.parse(raw);
  } catch (e) {
    return { success: false, error: e instanceof z.ZodError ? e.errors[0].message : 'Invalid data' };
  }

  const { items, invoice_discount_type, invoice_discount_value, is_scheme_invoice,
          bogo_discount_amount, loyalty_points_redeemed, ...header } = parsed;

  const lineResults = items.map((item) =>
    calcLine({
      quantity: item.quantity,
      rate: item.rate,
      discountType: item.discount_type ?? null,
      discountValue: item.discount_value ?? 0,
      gstRate: item.gst_rate,
      isScheme: is_scheme_invoice,
    })
  );

  const baseTotals = calcInvoiceTotals(lineResults, {
    discountType: invoice_discount_type ?? null,
    discountValue: invoice_discount_value ?? 0,
  });

  // Apply scheme + loyalty discounts so an edited invoice keeps them (#3).
  // NOTE: we persist the columns but do not re-process the loyalty ledger here —
  // points were redeemed at creation and are left as-is on edit.
  const postSchemeTotal = Math.max(0, baseTotals.grandTotal - bogo_discount_amount);
  const cappedLoyaltyPoints = header.customer_id
    ? Math.min(Math.max(0, loyalty_points_redeemed), Math.floor(postSchemeTotal))
    : 0;
  const loyaltyDiscountAmount = cappedLoyaltyPoints; // 1 pt = ₹1
  const finalGrandTotal = Math.max(0, postSchemeTotal - loyaltyDiscountAmount);
  const totals = { ...baseTotals, grandTotal: finalGrandTotal };

  try {
    const client = await (await import('@/lib/db')).pool.connect();
    try {
      await client.query('BEGIN');

      // Reverse old stock deductions
      const oldItems = await client.query(
        `SELECT ii.item_id, ii.variant_id, ii.size_id, ii.color_id, ii.quantity, i.item_type, inv.warehouse_id
         FROM invoice_items ii
         JOIN items i ON i.id=ii.item_id
         JOIN invoices inv ON inv.id=ii.invoice_id
         WHERE ii.invoice_id=$1`, [id]
      );
      for (const row of oldItems.rows as Array<{
        item_id: string; variant_id: string | null; size_id: string | null; color_id: string | null;
        quantity: string; item_type: string; warehouse_id: string;
      }>) {
        if (row.item_type === 'finished') {
          await client.query(
            `UPDATE stock SET quantity = quantity + $1
             WHERE item_id=$2 AND warehouse_id=$3
               AND COALESCE(size_id,  (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                   IS NOT DISTINCT FROM COALESCE($4::uuid, (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
               AND COALESCE(color_id, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                   IS NOT DISTINCT FROM COALESCE($5::uuid, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))`,
            [row.quantity, row.item_id, row.warehouse_id, row.size_id, row.color_id]
          );
        }
      }

      // Delete old items
      await client.query('DELETE FROM invoice_items WHERE invoice_id=$1', [id]);

      // Update header
      const newStatus = header.payment_mode === 'credit' ? 'issued'
        : header.amount_paid >= totals.grandTotal ? 'paid'
        : header.amount_paid > 0 ? 'partially_paid'
        : 'issued';

      await client.query(
        `UPDATE invoices SET
           customer_id=$1, warehouse_id=$2, invoice_date=$3, due_date=$4,
           invoice_type=$5, is_scheme_invoice=$6, is_recurring=$7, recurring_frequency=$8,
           payment_mode=$9, amount_paid=$10,
           invoice_discount_type=$11, invoice_discount_value=$12, invoice_discount_amount=$13,
           subtotal=$14, total_cgst=$15, total_sgst=$16, grand_total=$17,
           notes=$18, status=$19,
           scheme_discount_amount=$21, loyalty_points_redeemed=$22, loyalty_discount_amount=$23
         WHERE id=$20`,
        [
          header.customer_id ?? null, header.warehouse_id, header.invoice_date,
          header.due_date ?? null, header.invoice_type, is_scheme_invoice,
          header.is_recurring, header.recurring_frequency ?? null,
          header.payment_mode ?? null, header.amount_paid,
          invoice_discount_type ?? null, invoice_discount_value ?? null, totals.invoiceDiscountAmount,
          totals.subtotal, totals.totalCgst, totals.totalSgst, totals.grandTotal,
          header.notes ?? null, newStatus, id,
          bogo_discount_amount, cappedLoyaltyPoints, loyaltyDiscountAmount,
        ]
      );

      // Insert new items + deduct stock
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const lr = lineResults[i];
        await client.query(
          `INSERT INTO invoice_items (
             invoice_id, item_id, variant_id, size_id, color_id, sort_order,
             quantity, rate, discount_type, discount_value, discount_amount,
             hsn_code, gst_rate, taxable_value, cgst_amount, sgst_amount, total_amount
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [id, item.item_id, item.variant_id ?? null, item.size_id ?? null, item.color_id ?? null,
           i, item.quantity, item.rate,
           item.discount_type ?? null, item.discount_value ?? null, lr.discountAmount,
           item.hsn_code ?? null, item.gst_rate, lr.taxableValue, lr.cgstAmount, lr.sgstAmount, lr.totalAmount]
        );
        const typeRes = await client.query<{ item_type: string }>('SELECT item_type FROM items WHERE id=$1', [item.item_id]);
        if (typeRes.rows[0]?.item_type === 'finished') {
          await client.query(
            `UPDATE stock SET quantity = quantity - $1
             WHERE item_id=$2 AND warehouse_id=$3
               AND COALESCE(size_id,  (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                   IS NOT DISTINCT FROM COALESCE($4::uuid, (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
               AND COALESCE(color_id, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                   IS NOT DISTINCT FROM COALESCE($5::uuid, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))`,
            [item.quantity, item.item_id, header.warehouse_id, item.size_id ?? null, item.color_id ?? null]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to update invoice' };
  }

  logAudit({ userId: session.userId, action: 'update', entityType: 'invoice', entityId: id }).catch(() => {});
  redirect(`/billing/invoices/${id}`);
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function cancelInvoiceAction(id: string, _fd?: FormData): Promise<void> {
  const session = await requireRole('admin');

  let invoiceNumber = '';
  let customerPhone: string | null = null;
  let customerName: string | null = null;
  let invoiceGrandTotal = 0;

  try {
    const client = await (await import('@/lib/db')).pool.connect();
    try {
      await client.query('BEGIN');

      const invRes = await client.query<{
        status: string; warehouse_id: string; invoice_number: string; grand_total: string;
      }>(
        'SELECT status, warehouse_id, invoice_number, grand_total FROM invoices WHERE id=$1', [id]
      );
      if (!invRes.rows[0]) throw new Error('Invoice not found');
      if (invRes.rows[0].status === 'cancelled') throw new Error('Already cancelled');
      invoiceNumber = invRes.rows[0].invoice_number;
      invoiceGrandTotal = Number(invRes.rows[0].grand_total);

      // Fetch customer for WhatsApp (non-fatal)
      const custRes = await client.query<{ name: string | null; phone: string | null }>(
        `SELECT c.name, c.phone FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         WHERE i.id = $1`, [id]
      );
      customerPhone = custRes.rows[0]?.phone ?? null;
      customerName  = custRes.rows[0]?.name ?? null;

      // Reverse stock
      const items = await client.query(
        `SELECT ii.item_id, ii.variant_id, ii.size_id, ii.color_id, ii.quantity, i.item_type
         FROM invoice_items ii JOIN items i ON i.id=ii.item_id
         WHERE ii.invoice_id=$1`, [id]
      );
      for (const row of items.rows) {
        if (row.item_type === 'finished') {
          await client.query(
            `UPDATE stock SET quantity = quantity + $1
             WHERE item_id=$2 AND warehouse_id=$3
               AND COALESCE(size_id,  (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                   IS NOT DISTINCT FROM COALESCE($4::uuid, (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
               AND COALESCE(color_id, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                   IS NOT DISTINCT FROM COALESCE($5::uuid, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))`,
            [row.quantity, row.item_id, invRes.rows[0].warehouse_id, row.size_id, row.color_id]
          );
        }
      }

      await client.query(`UPDATE invoices SET status='cancelled' WHERE id=$1`, [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    logAudit({ userId: session.userId, action: 'delete', entityType: 'invoice', entityId: id, entityLabel: invoiceNumber }).catch(() => {});
  } catch (err) {
    console.error(err);
  }

  // sutra_invoice_cancelled: {{1}}=name, {{2}}=invoice#, {{3}}=amount (template body already reads "Rs.{{3}}")
  if (customerPhone && invoiceNumber) {
    sendWhatsAppTemplate(customerPhone, 'sutra_invoice_cancelled', [
      customerName ?? 'Customer',
      invoiceNumber,
      invoiceGrandTotal.toFixed(2),
    ]).catch((e) => console.error('[cancelInvoiceAction] WhatsApp failed:', e));
  }

  redirect('/billing/invoices');
}

// ─── Record Payment ───────────────────────────────────────────────────────────

export async function recordPaymentAction(
  id: string,
  formData: FormData
): Promise<void> {
  const session = await requireRole('admin', 'staff');

  const amount = parseFloat(formData.get('amount') as string);
  const mode = formData.get('payment_mode') as string;

  if (!amount || amount <= 0) return;

  const invRes = await query<{
    grand_total: string; amount_paid: string; invoice_number: string;
    customer_id: string | null; customer_phone: string | null; customer_name: string | null;
    loyalty_points_redeemed: string;
  }>(
    `SELECT i.grand_total, i.amount_paid, i.invoice_number, i.customer_id,
            i.loyalty_points_redeemed,
            c.phone AS customer_phone, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.id=$1`,
    [id]
  );
  if (!invRes.rows[0]) return;

  const grandTotal = Number(invRes.rows[0].grand_total);
  const newPaid = Number(invRes.rows[0].amount_paid) + amount;
  const capped = Math.min(newPaid, grandTotal);
  const newStatus = capped >= grandTotal ? 'paid' : 'partially_paid';

  const client = await (await import('@/lib/db')).pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE invoices SET amount_paid=$1, payment_mode=$2, status=$3 WHERE id=$4`,
      [capped, mode, newStatus, id]
    );
    try {
      await postPaymentReceived({
        invoiceId: id,
        invoiceNumber: invRes.rows[0].invoice_number,
        paymentDate: new Date().toISOString().slice(0, 10),
        amount: capped - Number(invRes.rows[0].amount_paid),
        paymentMode: mode,
        createdBy: session.userId,
      }, client);
    } catch (acctErr) { console.error('Accounting post failed:', acctErr); }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  logAudit({ userId: session.userId, action: 'payment', entityType: 'invoice', entityId: id, entityLabel: invRes.rows[0].invoice_number, newValue: { amount, mode, newStatus } }).catch(() => {});

  // Earn loyalty points when credit invoice is fully paid
  // Earn on net amount: grand total minus any loyalty discount already applied
  if (newStatus === 'paid' && invRes.rows[0].customer_id) {
    const existing = await query(
      `SELECT 1 FROM loyalty_transactions WHERE reference_id=$1 AND type='earned' LIMIT 1`, [id]
    );
    if (existing.rows.length === 0) {
      const rates = await getLoyaltyRates();
      const loyaltyRedeemed = Number(invRes.rows[0].loyalty_points_redeemed ?? 0);
      const loyaltyDiscount = loyaltyRedeemed; // 1 pt = ₹1
      const earnBase = Math.max(0, grandTotal - loyaltyDiscount);
      await earnPoints(invRes.rows[0].customer_id, earnBase, id, rates.earnRate);
    }
  }

  // Generate receipt PDF then send sutra_payment_received
  // {{1}}=name, {{2}}=amount, {{3}}=invoice# (template body already reads "Rs.{{2}}" — send the bare number)
  const receiptPath = await generateThermalInvoicePdf(id).catch(() => null);

  let waResult: 'sent' | 'failed' | 'skip' = 'skip';
  let waError = '';
  const phone = invRes.rows[0]?.customer_phone;
  if (phone) {
    try {
      const waSent = await sendWhatsAppTemplate(
        phone,
        'sutra_payment_received',
        [
          invRes.rows[0].customer_name ?? 'Customer',
          amount.toFixed(2),
          invRes.rows[0].invoice_number,
        ],
        receiptPath
      );
      waResult = waSent.success ? 'sent' : 'failed';
      if (!waSent.success) {
        waError = waSent.error ?? 'unknown error';
      }
    } catch (err) {
      waResult = 'failed';
      waError = (err as Error).message ?? 'unknown error';
    }
  }

  const waQuery = waResult === 'failed' && waError
    ? `?wa=failed&reason=${encodeURIComponent(waError)}`
    : `?wa=${waResult}`;
  const returnTo = (formData.get('return_to') as string) || `/billing/invoices/${id}${waQuery}`;
  redirect(returnTo);
}

// ─── Send WhatsApp Reminder ───────────────────────────────────────────────────

export async function sendReminderAction(
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');
  void session;

  const settingId = formData.get('setting_id') as string | null;

  const invRes = await query<{
    grand_total: string; amount_paid: string; invoice_number: string;
    invoice_date: string; due_date: string | null;
    customer_id: string | null; customer_name: string | null; phone: string | null;
  }>(
    `SELECT i.grand_total, i.amount_paid, i.invoice_number, i.invoice_date, i.due_date,
            c.id AS customer_id, c.name AS customer_name, c.phone
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.id = $1`,
    [id]
  );

  const inv = invRes.rows[0];
  if (!inv) return { success: false, error: 'Invoice not found' };
  if (!inv.phone) return { success: false, error: 'Customer has no phone number on file' };

  const balance = Number(inv.grand_total) - Number(inv.amount_paid);
  const overdueDate = inv.due_date
    ? new Date(inv.due_date)
    : new Date(new Date(inv.invoice_date).getTime() + 30 * 86400000);
  const daysOverdue = Math.max(0, Math.floor((Date.now() - overdueDate.getTime()) / 86400000));

  let template: string;
  let resolvedSettingId: string | null = settingId;

  if (settingId) {
    const stRes = await query<{ message_template: string }>(
      `SELECT message_template FROM reminder_settings WHERE id=$1`, [settingId]
    );
    template = stRes.rows[0]?.message_template
      ?? `Hi {{name}}, invoice {{invoice_number}} of {{amount}} is {{days}} day(s) overdue. — Sutra Collections.`;
  } else {
    const stRes = await query<{ id: string; message_template: string }>(
      `SELECT id, message_template FROM reminder_settings
       WHERE is_active=TRUE AND day_threshold <= $1
       ORDER BY day_threshold DESC LIMIT 1`,
      [Math.max(daysOverdue, 0)]
    );
    template          = stRes.rows[0]?.message_template
      ?? `Hi {{name}}, invoice {{invoice_number}} of {{amount}} is {{days}} day(s) overdue. — Sutra Collections.`;
    resolvedSettingId = stRes.rows[0]?.id ?? null;
  }

  const message = interpolateTemplate(template, {
    name:           inv.customer_name ?? 'Customer',
    invoice_number: inv.invoice_number,
    amount:         `₹${balance.toFixed(2)}`,
    days:           String(daysOverdue),
  });

  // Generate thermal PDF and attach to reminder
  const reminderPdfPath = await generateThermalInvoicePdf(id).catch(() => null);

  // sutra_payment_reminder: {{1}}=name, {{2}}=amount due, {{3}}=invoice# (template body already reads "Rs.{{2}}")
  const result = await sendWhatsAppTemplate(
    inv.phone,
    'sutra_payment_reminder',
    [inv.customer_name ?? 'Customer', balance.toFixed(2), inv.invoice_number],
    reminderPdfPath
  );

  await query(
    `INSERT INTO reminder_logs (customer_id, invoice_id, setting_id, phone_number, message_sent, whatsapp_message_id, status, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      inv.customer_id, id, resolvedSettingId, inv.phone, message,
      result.messageId ?? null,
      result.success ? 'sent' : 'failed',
      result.error ?? null,
    ]
  ).catch(() => {});

  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}

// ─── Apply Store Credit ───────────────────────────────────────────────────────

export async function applyStoreCreditAction(
  id: string,
  formData: FormData
): Promise<void> {
  const session = await requireRole('admin', 'staff');

  const applyAmount = parseFloat(formData.get('apply_amount') as string);
  if (!applyAmount || applyAmount <= 0) return;

  const client = await (await import('@/lib/db')).pool.connect();
  try {
    await client.query('BEGIN');

    const invRes = await client.query<{
      grand_total: string; amount_paid: string; invoice_number: string;
      customer_id: string | null; store_credit_balance: string;
    }>(
      `SELECT i.grand_total, i.amount_paid, i.invoice_number, i.customer_id,
              c.store_credit_balance
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.id = $1 FOR UPDATE`,
      [id]
    );
    const inv = invRes.rows[0];
    if (!inv || !inv.customer_id) throw new Error('Invoice or customer not found');

    const outstanding = Number(inv.grand_total) - Number(inv.amount_paid);
    const available   = Number(inv.store_credit_balance);
    const capped      = Math.min(applyAmount, outstanding, available);
    if (capped <= 0) throw new Error('No applicable store credit');

    const newPaid   = Number(inv.amount_paid) + capped;
    const newStatus = newPaid >= Number(inv.grand_total) ? 'paid' : 'partially_paid';

    await client.query(
      `UPDATE customers SET store_credit_balance = store_credit_balance - $1 WHERE id=$2`,
      [capped, inv.customer_id]
    );
    await client.query(
      `UPDATE invoices SET amount_paid=$1, store_credit_used = store_credit_used + $2, status=$3 WHERE id=$4`,
      [newPaid, capped, newStatus, id]
    );
    await client.query(
      `INSERT INTO store_credit_transactions (customer_id, amount, transaction_type, reference_id, notes, created_by)
       VALUES ($1,$2,'applied',$3,$4,$5)`,
      [inv.customer_id, -capped, id, `Applied to invoice ${inv.invoice_number}`, session.userId]
    );

    try {
      await postJournalEntry({
        entryDate:     new Date().toISOString().slice(0, 10),
        description:   `Store credit applied — ${inv.invoice_number}`,
        referenceType: 'payment',
        referenceId:   id,
        createdBy:     session.userId,
        lines: [
          { accountCode: '1001', debit: capped, credit: 0 },
          { accountCode: '1100', debit: 0, credit: capped },
        ],
      }, client);
    } catch (acctErr) { console.error('Journal post failed:', acctErr); }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  redirect(`/billing/invoices/${id}`);
}

// ─── Retry WhatsApp Invoice Notification ─────────────────────────────────────

export async function retryInvoiceWaAction(invoiceId: string): Promise<void> {
  await requireRole('admin', 'staff');

  const res = await query<{
    invoice_number: string; grand_total: string;
    name: string | null; phone: string | null;
  }>(
    `SELECT i.invoice_number, i.grand_total, c.name, c.phone
     FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.id = $1`,
    [invoiceId]
  );

  const inv = res.rows[0];
  let waResult = 'skip';
  let waError = '';

  if (inv?.phone) {
    try {
      const retryPdf = await generateThermalInvoicePdf(invoiceId).catch(() => null);
      const r = await sendWhatsAppTemplate(
        inv.phone,
        'sutra_invoice_notification',
        [inv.name ?? 'Customer', inv.invoice_number, Number(inv.grand_total).toFixed(2)],
        retryPdf
      );
      console.log('[WhatsApp] Retry result:', JSON.stringify(r));
      waResult = r.success ? 'sent' : 'failed';
      if (!r.success) {
        waError = r.error ?? 'unknown error';
        console.warn(`[WhatsApp] Retry failed for ${inv.invoice_number}: ${waError}`);
      }
    } catch (err) {
      waResult = 'failed';
      waError = (err as Error).message ?? 'unknown error';
    }
  }

  const waQuery = waResult === 'failed' && waError
    ? `?wa=failed&reason=${encodeURIComponent(waError)}`
    : `?wa=${waResult}`;
  redirect(`/billing/invoices/${invoiceId}${waQuery}`);
}
