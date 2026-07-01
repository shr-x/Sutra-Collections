'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { calcLine, calcInvoiceTotals } from '@/lib/gst';
import { nextInvoiceNumber } from '@/lib/invoice-number';
import { postPurchaseInvoice } from '@/lib/accounting';
import type { ActionResult } from '@/types';

const LineSchema = z.object({
  item_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  size_id: z.string().uuid().nullable().optional(),
  color_id: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().positive(),
  rate: z.coerce.number().nonnegative(),
  hsn_code: z.string().max(10).nullable().optional(),
  gst_rate: z.coerce.number().min(0).max(100),
});

const PurchaseSchema = z.object({
  supplier_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  supplier_invoice_number: z.string().max(100).optional(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  include_in_gst: z.boolean().default(true),
  payment_mode: z.enum(['cash', 'card', 'upi', 'credit']).nullable().optional(),
  amount_paid: z.coerce.number().nonnegative().default(0),
  notes: z.string().max(500).nullable().optional(),
  items: z.array(LineSchema).min(1),
});

export async function createPurchaseInvoiceAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole('admin');

  let parsed: z.infer<typeof PurchaseSchema>;
  try {
    const raw = JSON.parse(formData.get('payload') as string);
    parsed = PurchaseSchema.parse(raw);
  } catch (e) {
    return { success: false, error: e instanceof z.ZodError ? e.errors[0].message : 'Invalid data' };
  }

  const { items, ...header } = parsed;
  const lineResults = items.map((item) =>
    calcLine({ quantity: item.quantity, rate: item.rate, gstRate: item.gst_rate })
  );
  const totals = calcInvoiceTotals(lineResults);
  const cappedAmountPaid = Math.min(header.amount_paid, totals.grandTotal);
  const newStatus = cappedAmountPaid >= totals.grandTotal ? 'paid' : cappedAmountPaid > 0 ? 'partially_paid' : 'confirmed';

  let purId: string;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const num = await nextInvoiceNumber('PUR', client);
      const res = await client.query<{ id: string }>(
        `INSERT INTO purchase_invoices (
           purchase_number, supplier_id, warehouse_id, supplier_invoice_number, purchase_date,
           status, include_in_gst, payment_mode, amount_paid,
           subtotal, total_cgst, total_sgst, grand_total, notes, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [num, header.supplier_id, header.warehouse_id, header.supplier_invoice_number ?? null,
         header.purchase_date, newStatus, header.include_in_gst,
         header.payment_mode ?? null, cappedAmountPaid,
         totals.subtotal, totals.totalCgst, totals.totalSgst, totals.grandTotal,
         header.notes ?? null, session.userId]
      );
      purId = res.rows[0].id;

      for (let i = 0; i < items.length; i++) {
        const item = items[i]; const lr = lineResults[i];
        await client.query(
          `INSERT INTO purchase_invoice_items (purchase_invoice_id, item_id, variant_id, size_id, color_id, sort_order, quantity, rate, hsn_code, gst_rate, taxable_value, cgst_amount, sgst_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [purId, item.item_id, item.variant_id ?? null, item.size_id ?? null, item.color_id ?? null,
           i, item.quantity, item.rate, item.hsn_code ?? null, item.gst_rate,
           lr.taxableValue, lr.cgstAmount, lr.sgstAmount, lr.totalAmount]
        );
        // Add to stock: UPDATE existing row first, INSERT if none matched
        // Uses COALESCE so it finds both null-size rows (old items) and sized rows (new items)
        const stockUpd = await client.query(
          `UPDATE stock SET quantity = quantity + $1
           WHERE item_id=$2 AND warehouse_id=$3
             AND COALESCE(size_id,  (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                 IS NOT DISTINCT FROM COALESCE($4::uuid, (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
             AND COALESCE(color_id, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                 IS NOT DISTINCT FROM COALESCE($5::uuid, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))`,
          [item.quantity, item.item_id, header.warehouse_id, item.size_id ?? null, item.color_id ?? null]
        );
        console.log('[STOCK] Purchase add rows updated:', stockUpd.rowCount, 'item', item.item_id, 'size', item.size_id ?? null, 'color', item.color_id ?? null);
        if ((stockUpd.rowCount ?? 0) === 0) {
          await client.query(
            `INSERT INTO stock (item_id, size_id, color_id, warehouse_id, quantity)
             VALUES ($1,$2,$3,$4,$5)`,
            [item.item_id, item.size_id ?? null, item.color_id ?? null, header.warehouse_id, item.quantity]
          );
        }
        await client.query(
          `INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_id, notes, created_by)
           VALUES ($1,$2,'purchase',$3,$4,'Purchase invoice',$5)`,
          [item.item_id, header.warehouse_id, item.quantity, purId, session.userId]
        );
      }

      try {
        await postPurchaseInvoice({
          purchaseId: purId!,
          purchaseNumber: num,
          purchaseDate: header.purchase_date,
          grandTotal: totals.grandTotal,
          taxableValue: totals.grandTotal - totals.totalCgst - totals.totalSgst,
          totalCgst: totals.totalCgst,
          totalSgst: totals.totalSgst,
          includeInGst: header.include_in_gst,
          paymentMode: header.payment_mode ?? null,
          amountPaid: cappedAmountPaid,
          createdBy: session.userId,
        }, client);
      } catch (acctErr) { console.error('Accounting post failed:', acctErr); }

      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to create purchase invoice' };
  }

  redirect(`/billing/purchases/${purId!}`);
}
