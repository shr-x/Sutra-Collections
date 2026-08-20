'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { calcLine, calcInvoiceTotals } from '@/lib/gst';
import { nextInvoiceNumber } from '@/lib/invoice-number';
import { postDebitNote } from '@/lib/accounting';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { generateDebitNotePdf } from '@/lib/pdf-generator';
import { resolveStockVariant } from '@/lib/stock-variant';
import type { ActionResult } from '@/types';

const optUuid = (s: z.ZodTypeAny) =>
  z.preprocess((v) => (v == null || v === '' ? null : v), s.nullable().optional());

const LineSchema = z.object({
  item_id: z.string().uuid(),
  variant_id: optUuid(z.string().uuid()),
  purchase_invoice_item_id: optUuid(z.string().uuid()),
  quantity: z.coerce.number().positive(),
  rate: z.coerce.number().nonnegative(),
  hsn_code: z.string().max(10).nullable().optional(),
  gst_rate: z.coerce.number().min(0).max(28),
});

const DebitNoteSchema = z.object({
  purchase_invoice_id: optUuid(z.string().uuid()),
  supplier_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
  reduces_itc: z.boolean().default(true),
  items: z.array(LineSchema).min(1),
});

export async function createDebitNoteAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole('admin');

  let parsed: z.infer<typeof DebitNoteSchema>;
  try {
    const raw = JSON.parse(formData.get('payload') as string);
    parsed = DebitNoteSchema.parse(raw);
  } catch (e) {
    return { success: false, error: e instanceof z.ZodError ? e.errors[0].message : 'Invalid data' };
  }

  const lineResults = parsed.items.map((item) =>
    calcLine({ quantity: item.quantity, rate: item.rate, gstRate: item.gst_rate })
  );
  const totals = calcInvoiceTotals(lineResults);

  let dnId: string;
  let dnNum = '';
  let supplierPhone: string | null = null;
  let supplierName: string | null = null;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const num = await nextInvoiceNumber('DN', client);
      dnNum = num;
      const res = await client.query<{ id: string }>(
        `INSERT INTO debit_notes (debit_note_number, purchase_invoice_id, supplier_id, status, reason, reduces_itc, subtotal, total_cgst, total_sgst, grand_total, created_by)
         VALUES ($1,$2,$3,'issued',$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [num, parsed.purchase_invoice_id ?? null, parsed.supplier_id,
         parsed.reason ?? null, parsed.reduces_itc,
         totals.subtotal, totals.totalCgst, totals.totalSgst, totals.grandTotal, session.userId]
      );
      dnId = res.rows[0].id;

      // Fetch supplier contact for WhatsApp notification
      const suppRes = await client.query<{ phone: string | null; name: string | null }>(
        'SELECT phone, name FROM suppliers WHERE id=$1', [parsed.supplier_id]
      );
      supplierPhone = suppRes.rows[0]?.phone ?? null;
      supplierName  = suppRes.rows[0]?.name  ?? null;

      for (let i = 0; i < parsed.items.length; i++) {
        const item = parsed.items[i]; const lr = lineResults[i];
        await client.query(
          `INSERT INTO debit_note_items (debit_note_id, purchase_invoice_item_id, item_id, variant_id, quantity, rate, hsn_code, gst_rate, taxable_value, cgst_amount, sgst_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [dnId, item.purchase_invoice_item_id ?? null, item.item_id, item.variant_id ?? null,
           item.quantity, item.rate, item.hsn_code ?? null, item.gst_rate,
           lr.taxableValue, lr.cgstAmount, lr.sgstAmount, lr.totalAmount]
        );
        // Return stock to warehouse (purchase return) — target the exact
        // size/color row recorded on the original purchase line, mirroring the
        // credit-note pattern so we never fan-out across every variant row.
        let sourceSizeId: string | null = null;
        let sourceColorId: string | null = null;
        if (item.purchase_invoice_item_id) {
          const piiRes = await client.query<{ size_id: string | null; color_id: string | null }>(
            'SELECT size_id, color_id FROM purchase_invoice_items WHERE id=$1', [item.purchase_invoice_item_id]
          );
          sourceSizeId  = piiRes.rows[0]?.size_id  ?? null;
          sourceColorId = piiRes.rows[0]?.color_id ?? null;
        }
        // Root-cause fix: fall back to the item's default variant if the source
        // line has no purchase_invoice_item_id, or (for pre-fix legacy rows) the
        // source line itself never had size/color resolved.
        const { sizeId, colorId } = await resolveStockVariant(client, item.item_id, sourceSizeId, sourceColorId);
        const dnStockUpd = await client.query(
          `UPDATE stock SET quantity = quantity + $1
           WHERE item_id=$2 AND warehouse_id=$3
             AND COALESCE(size_id,  (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                 IS NOT DISTINCT FROM COALESCE($4::uuid, (SELECT id FROM item_sizes  WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
             AND COALESCE(color_id, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))
                 IS NOT DISTINCT FROM COALESCE($5::uuid, (SELECT id FROM item_colors WHERE item_id=$2 AND is_default=TRUE LIMIT 1))`,
          [item.quantity, item.item_id, parsed.warehouse_id, sizeId, colorId]
        );
        console.log('[STOCK] Debit note return rows updated:', dnStockUpd.rowCount);
        if ((dnStockUpd.rowCount ?? 0) === 0) {
          await client.query(
            `INSERT INTO stock (item_id, size_id, color_id, warehouse_id, quantity)
             VALUES ($1,$2,$3,$4,$5)`,
            [item.item_id, sizeId, colorId, parsed.warehouse_id, item.quantity]
          );
        }
        await client.query(
          `INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, reference_id, notes, created_by)
           VALUES ($1,$2,'adjustment_in',$3,$4,'Purchase return (debit note)',$5)`,
          [item.item_id, parsed.warehouse_id, item.quantity, dnId, session.userId]
        );
      }

      try {
        await postDebitNote({
          debitNoteId: dnId!,
          debitNoteNumber: num,
          noteDate: new Date().toISOString().slice(0, 10),
          grandTotal: totals.grandTotal,
          taxableValue: totals.grandTotal - totals.totalCgst - totals.totalSgst,
          totalCgst: totals.totalCgst,
          totalSgst: totals.totalSgst,
          reducesItc: parsed.reduces_itc,
          createdBy: session.userId,
        }, client);
      } catch (acctErr) { console.error('Accounting post failed:', acctErr); }

      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to create debit note' };
  }

  // Generate debit note PDF and send sutra_debit_note_issued to supplier
  // {{1}}=supplier name, {{2}}=dn#, {{3}}=amount (template body already reads "Rs.{{3}}")
  if (supplierPhone) {
    generateDebitNotePdf(dnId!).then((pdfPath) =>
      sendWhatsAppTemplate(
        supplierPhone!,
        'sutra_debit_note_issued',
        [supplierName ?? 'Supplier', dnNum, totals.grandTotal.toFixed(2)],
        pdfPath
      )
    ).catch((e) => console.error('[createDebitNoteAction] WhatsApp failed:', e));
  }

  redirect(`/billing/debit-notes/${dnId!}`);
}
