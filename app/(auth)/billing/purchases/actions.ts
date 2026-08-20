'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool, query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { calcLine, calcInvoiceTotals } from '@/lib/gst';
import { nextInvoiceNumber } from '@/lib/invoice-number';
import { postPurchaseInvoice } from '@/lib/accounting';
import { generateStickersForPurchase } from '@/lib/stickers';
import { resolveStockVariant } from '@/lib/stock-variant';
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
  is_tax_inclusive: z.boolean().default(true),
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

  if (header.supplier_invoice_number?.trim()) {
    const dupe = await query<{ id: string }>(
      `SELECT id FROM purchase_invoices WHERE supplier_id=$1 AND supplier_invoice_number=$2`,
      [header.supplier_id, header.supplier_invoice_number.trim()]
    );
    if (dupe.rows[0]) {
      return { success: false, error: 'This invoice number already exists for this supplier.' };
    }
  }

  const lineResults = items.map((item) =>
    calcLine({ quantity: item.quantity, rate: item.rate, gstRate: item.gst_rate, isScheme: !header.is_tax_inclusive })
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
           status, include_in_gst, is_tax_inclusive, payment_mode, amount_paid,
           subtotal, total_cgst, total_sgst, grand_total, notes, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [num, header.supplier_id, header.warehouse_id, header.supplier_invoice_number ?? null,
         header.purchase_date, newStatus, header.include_in_gst, header.is_tax_inclusive,
         header.payment_mode ?? null, cappedAmountPaid,
         totals.subtotal, totals.totalCgst, totals.totalSgst, totals.grandTotal,
         header.notes ?? null, session.userId]
      );
      purId = res.rows[0].id;

      for (let i = 0; i < items.length; i++) {
        const item = items[i]; const lr = lineResults[i];

        // Root-cause fix: never let a purchase line create a stock row with an
        // unresolved size/color — if the caller (e.g. AI import prefill) didn't
        // resolve one, fall back to the item's default variant instead of
        // persisting NULL and corrupting stock lookups.
        const { sizeId, colorId } = await resolveStockVariant(client, item.item_id, item.size_id, item.color_id);

        await client.query(
          `INSERT INTO purchase_invoice_items (purchase_invoice_id, item_id, variant_id, size_id, color_id, sort_order, quantity, rate, hsn_code, gst_rate, taxable_value, cgst_amount, sgst_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [purId, item.item_id, item.variant_id ?? null, sizeId, colorId,
           i, item.quantity, item.rate, item.hsn_code ?? null, item.gst_rate,
           lr.taxableValue, lr.cgstAmount, lr.sgstAmount, lr.totalAmount]
        );
        // Add to stock: UPDATE existing row first, INSERT if none matched
        const stockUpd = await client.query(
          `UPDATE stock SET quantity = quantity + $1
           WHERE item_id=$2 AND warehouse_id=$3
             AND size_id  IS NOT DISTINCT FROM $4::uuid
             AND color_id IS NOT DISTINCT FROM $5::uuid`,
          [item.quantity, item.item_id, header.warehouse_id, sizeId, colorId]
        );
        console.log('[STOCK] Purchase add rows updated:', stockUpd.rowCount, 'item', item.item_id, 'size', sizeId, 'color', colorId);
        if ((stockUpd.rowCount ?? 0) === 0) {
          await client.query(
            `INSERT INTO stock (item_id, size_id, color_id, warehouse_id, quantity)
             VALUES ($1,$2,$3,$4,$5)`,
            [item.item_id, sizeId, colorId, header.warehouse_id, item.quantity]
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

      try {
        await generateStickersForPurchase(client, purId);
      } catch (stickerErr) { console.error('Sticker generation failed (non-fatal):', stickerErr); }

      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to create purchase invoice' };
  }

  redirect(`/billing/purchases/${purId!}`);
}
