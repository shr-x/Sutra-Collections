'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query, pool } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { calcLine, calcInvoiceTotals } from '@/lib/gst';
import { nextInvoiceNumber } from '@/lib/invoice-number';
import { createInvoiceAction } from '@/app/(auth)/billing/invoices/actions';
import type { ActionResult } from '@/types';

const LineSchema = z.object({
  item_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().positive(),
  rate: z.coerce.number().nonnegative(),
  discount_type: z.enum(['flat', 'percent']).nullable().optional(),
  discount_value: z.coerce.number().nonnegative().nullable().optional(),
  hsn_code: z.string().max(10).nullable().optional(),
  gst_rate: z.coerce.number().min(0).max(28),
});

const QuoteSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  warehouse_id: z.string().uuid(),
  valid_until: z.string().optional().nullable(),
  is_scheme_invoice: z.boolean().default(false),
  notes: z.string().max(500).nullable().optional(),
  items: z.array(LineSchema).min(1),
});

export async function createQuotationAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireRole('admin');

  let parsed: z.infer<typeof QuoteSchema>;
  try {
    const raw = JSON.parse(formData.get('payload') as string);
    parsed = QuoteSchema.parse(raw);
  } catch (e) {
    return { success: false, error: e instanceof z.ZodError ? e.errors[0].message : 'Invalid data' };
  }

  const { items, is_scheme_invoice, ...header } = parsed;
  const lineResults = items.map((item) =>
    calcLine({ quantity: item.quantity, rate: item.rate, discountType: item.discount_type ?? null, discountValue: item.discount_value ?? 0, gstRate: item.gst_rate, isScheme: is_scheme_invoice })
  );
  const totals = calcInvoiceTotals(lineResults);

  let qId: string;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const num = await nextInvoiceNumber('QUO', client);
      const res = await client.query<{ id: string }>(
        `INSERT INTO quotations (quotation_number, customer_id, warehouse_id, valid_until, is_scheme_invoice, subtotal, total_cgst, total_sgst, grand_total, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [num, header.customer_id ?? null, header.warehouse_id, header.valid_until ?? null, is_scheme_invoice,
         totals.subtotal, totals.totalCgst, totals.totalSgst, totals.grandTotal, header.notes ?? null, session.userId]
      );
      qId = res.rows[0].id;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]; const lr = lineResults[i];
        await client.query(
          `INSERT INTO quotation_items (quotation_id, item_id, variant_id, sort_order, quantity, rate, discount_type, discount_value, discount_amount, hsn_code, gst_rate, taxable_value, cgst_amount, sgst_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [qId, item.item_id, item.variant_id ?? null, i, item.quantity, item.rate,
           item.discount_type ?? null, item.discount_value ?? null, lr.discountAmount,
           item.hsn_code ?? null, item.gst_rate, lr.taxableValue, lr.cgstAmount, lr.sgstAmount, lr.totalAmount]
        );
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to create quotation' };
  }

  redirect(`/billing/quotations/${qId!}`);
}

export async function updateQuotationStatusAction(id: string, status: string, _fd?: FormData): Promise<void> {
  await requireRole('admin');
  await query('UPDATE quotations SET status=$1 WHERE id=$2', [status, id]);
  redirect(`/billing/quotations/${id}`);
}

export async function convertQuotationToInvoiceAction(id: string, _fd?: FormData): Promise<void> {
  await requireRole('admin');

  // Load quotation and items
  const qRes = await query('SELECT * FROM quotations WHERE id=$1', [id]);
  if (!qRes.rows[0]) throw new Error('Quotation not found');
  const q = qRes.rows[0];
  if (q.status === 'converted') throw new Error('Already converted');

  const itemsRes = await query(
    'SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY sort_order', [id]
  );

  // Build formData with same payload structure as createInvoiceAction
  const fd = new FormData();
  fd.set('payload', JSON.stringify({
    customer_id: q.customer_id,
    warehouse_id: q.warehouse_id,
    invoice_date: new Date().toISOString().slice(0, 10),
    invoice_type: 'gst',
    is_scheme_invoice: q.is_scheme_invoice,
    notes: q.notes,
    items: itemsRes.rows.map((r) => ({
      item_id: r.item_id, variant_id: r.variant_id, quantity: Number(r.quantity),
      rate: Number(r.rate), discount_type: r.discount_type, discount_value: r.discount_value ? Number(r.discount_value) : null,
      hsn_code: r.hsn_code, gst_rate: Number(r.gst_rate),
    })),
  }));

  // createInvoiceAction calls redirect() on success (which throws NEXT_REDIRECT)
  // so we mark converted first, then let the redirect propagate
  await query(`UPDATE quotations SET status='converted' WHERE id=$1`, [id]);
  await createInvoiceAction({ success: false }, fd);
}
