'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { calcLine, calcInvoiceTotals } from '@/lib/gst';
import { nextInvoiceNumber } from '@/lib/invoice-number';
import { postCreditNote } from '@/lib/accounting';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { generateCreditNotePdf } from '@/lib/pdf-generator';
import { logAudit } from '@/lib/audit';
import type { ActionResult } from '@/types';

const optUuid = (s: z.ZodTypeAny) =>
  z.preprocess((v) => (v == null || v === '' ? null : v), s.nullable().optional());

const LineSchema = z.object({
  item_id: z.string().uuid(),
  variant_id: optUuid(z.string().uuid()),
  invoice_item_id: optUuid(z.string().uuid()),
  quantity: z.coerce.number().positive(),
  rate: z.coerce.number().nonnegative(),
  hsn_code: z.string().max(10).nullable().optional(),
  gst_rate: z.coerce.number().min(0).max(28),
});

const CreditNoteSchema = z.object({
  invoice_id: optUuid(z.string().uuid()),
  customer_id: optUuid(z.string().uuid()),
  reason: z.string().max(500).optional(),
  resolution: z.enum(['refund', 'loyalty_points']).optional(),
  warehouse_id: z.string().uuid(),
  items: z.array(LineSchema).min(1),
});

export async function createCreditNoteAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole('admin', 'staff');

  let parsed: z.infer<typeof CreditNoteSchema>;
  try {
    const raw = JSON.parse(formData.get('payload') as string);
    parsed = CreditNoteSchema.parse(raw);
  } catch (e) {
    return { success: false, error: e instanceof z.ZodError ? e.errors[0].message : 'Invalid data' };
  }

  // Self-heal: ensure 'loyalty_points' is a valid resolution (idempotent, runs once per cold DB)
  await pool.query(`
    DO $$
    DECLARE con_name TEXT;
    BEGIN
      SELECT conname INTO con_name FROM pg_constraint
      WHERE conrelid = 'credit_notes'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%resolution%'
        AND pg_get_constraintdef(oid) NOT LIKE '%loyalty_points%';
      IF con_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE credit_notes DROP CONSTRAINT %I', con_name);
        ALTER TABLE credit_notes ADD CONSTRAINT credit_notes_resolution_check
          CHECK (resolution IN ('refund', 'store_credit', 'loyalty_points'));
      END IF;
    END $$;
  `).catch((e: Error) => console.warn('[createCreditNoteAction] Constraint patch skipped:', e.message));

  const lineResults = parsed.items.map((item) =>
    calcLine({ quantity: item.quantity, rate: item.rate, gstRate: item.gst_rate })
  );
  const totals = calcInvoiceTotals(lineResults);

  let cnId: string;
  let cnNum: string;
  let customerPhone: string | null = null;
  let customerName: string | null = null;
  let origInvoiceNumber: string | null = null;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const num = await nextInvoiceNumber('CN', client);
      cnNum = num;

      // Fetch customer info while in transaction
      if (parsed.customer_id) {
        const custRes = await client.query<{ phone: string | null; name: string | null }>(
          'SELECT phone, name FROM customers WHERE id=$1', [parsed.customer_id]
        );
        customerPhone = custRes.rows[0]?.phone ?? null;
        customerName  = custRes.rows[0]?.name  ?? null;
      }
      // Fetch original invoice number
      if (parsed.invoice_id) {
        const invRes = await client.query<{ invoice_number: string }>(
          'SELECT invoice_number FROM invoices WHERE id=$1', [parsed.invoice_id]
        );
        origInvoiceNumber = invRes.rows[0]?.invoice_number ?? null;
      }

      // Refunds complete immediately (stock returned + money/points given), so
      // they are created already 'settled' — no separate settlement step (#3).
      const res = await client.query<{ id: string }>(
        `INSERT INTO credit_notes (credit_note_number, invoice_id, customer_id, status, resolution, reason, subtotal, total_cgst, total_sgst, grand_total, created_by)
         VALUES ($1,$2,$3,'settled',$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [num, parsed.invoice_id ?? null, parsed.customer_id ?? null,
         parsed.resolution ?? null, parsed.reason ?? null,
         totals.subtotal, totals.totalCgst, totals.totalSgst, totals.grandTotal, session.userId]
      );
      cnId = res.rows[0].id;

      for (let i = 0; i < parsed.items.length; i++) {
        const item = parsed.items[i]; const lr = lineResults[i];
        await client.query(
          `INSERT INTO credit_note_items (credit_note_id, invoice_item_id, item_id, variant_id, quantity, rate, hsn_code, gst_rate, taxable_value, cgst_amount, sgst_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [cnId, item.invoice_item_id ?? null, item.item_id, item.variant_id ?? null,
           item.quantity, item.rate, item.hsn_code ?? null, item.gst_rate,
           lr.taxableValue, lr.cgstAmount, lr.sgstAmount, lr.totalAmount]
        );
        // Return stock for finished goods
        const typeRes = await client.query<{ item_type: string }>('SELECT item_type FROM items WHERE id=$1', [item.item_id]);
        if (typeRes.rows[0]?.item_type === 'finished') {
          let sizeId: string | null = null;
          let colorId: string | null = null;
          if (item.invoice_item_id) {
            const iiRes = await client.query<{ size_id: string | null; color_id: string | null }>(
              'SELECT size_id, color_id FROM invoice_items WHERE id=$1', [item.invoice_item_id]
            );
            sizeId  = iiRes.rows[0]?.size_id  ?? null;
            colorId = iiRes.rows[0]?.color_id ?? null;
          }
          const stockUpd = await client.query(
            `UPDATE stock SET quantity = quantity + $1
             WHERE item_id=$2 AND warehouse_id=$3
               AND COALESCE(size_id,  (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                   IS NOT DISTINCT FROM COALESCE($4::uuid, (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
               AND COALESCE(color_id, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                   IS NOT DISTINCT FROM COALESCE($5::uuid, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))`,
            [item.quantity, item.item_id, parsed.warehouse_id, sizeId, colorId]
          );
          console.log('[STOCK] Credit note return rows updated:', stockUpd.rowCount);
          if ((stockUpd.rowCount ?? 0) === 0) {
            await client.query(
              `INSERT INTO stock (item_id, size_id, color_id, warehouse_id, quantity)
               VALUES ($1,$2,$3,$4,$5)`,
              [item.item_id, sizeId, colorId, parsed.warehouse_id, item.quantity]
            );
          }
          await client.query(
            `INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_id, notes, created_by)
             VALUES ($1,$2,'adjustment_in',$3,$4,'Sales return (credit note)',$5)`,
            [item.item_id, parsed.warehouse_id, item.quantity, cnId, session.userId]
          );
        }
      }

      // Loyalty points resolution: ₹1 = 1 pt
      if (parsed.resolution === 'loyalty_points' && parsed.customer_id) {
        const pointsToAdd = Math.floor(totals.grandTotal);
        if (pointsToAdd > 0) {
          await client.query(
            `UPDATE customers SET loyalty_points_balance = loyalty_points_balance + $1 WHERE id=$2`,
            [pointsToAdd, parsed.customer_id]
          );
          await client.query(
            `INSERT INTO loyalty_transactions (customer_id, points, type, reference_id, reference_type)
             VALUES ($1,$2,'earned',$3,'credit_note')`,
            [parsed.customer_id, pointsToAdd, cnId]
          );
        }
      }

      try {
        await postCreditNote({
          creditNoteId: cnId!,
          creditNoteNumber: num,
          noteDate: new Date().toISOString().slice(0, 10),
          grandTotal: totals.grandTotal,
          taxableValue: totals.grandTotal - totals.totalCgst - totals.totalSgst,
          totalCgst: totals.totalCgst,
          totalSgst: totals.totalSgst,
          resolution: parsed.resolution ?? null,
          createdBy: session.userId,
        }, client);
      } catch (acctErr) { console.error('[createCreditNoteAction] Accounting post failed:', acctErr); }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[createCreditNoteAction] DB error:', err);
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error('[createCreditNoteAction] Failed:', (err as Error)?.message ?? err);
    return { success: false, error: `Failed to create credit note: ${(err as Error)?.message ?? 'Unknown error'}` };
  }

  logAudit({ userId: session.userId, action: 'create', entityType: 'credit_note', entityId: cnId!, entityLabel: cnNum, newValue: { grandTotal: totals.grandTotal, resolution: parsed.resolution } }).catch(() => {});

  // Generate credit note PDF and send sutra_refund_issued
  // {{1}}=name, {{2}}=refund amount, {{3}}=invoice# (template body already reads "Rs.{{2}}")
  if (customerPhone) {
    generateCreditNotePdf(cnId!).then((pdfPath) =>
      sendWhatsAppTemplate(
        customerPhone!,
        'sutra_refund_issued',
        [
          customerName ?? 'Customer',
          totals.grandTotal.toFixed(2),
          origInvoiceNumber ?? cnNum,
        ],
        pdfPath
      )
    ).catch((e) => console.error('[createCreditNoteAction] WhatsApp failed:', e));
  }

  redirect(`/billing/credit-notes/${cnId!}`);
}
