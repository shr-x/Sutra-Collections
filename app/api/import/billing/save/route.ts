import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import pool from '@/lib/db';
import { nextInvoiceNumber } from '@/lib/invoice-number';

interface BillingItem {
  name: string; quantity: string; rate: string; gst_rate: string;
}

interface BillingPayload {
  type: 'purchase' | 'sales';
  party_name: string;
  invoice_date: string;
  items: BillingItem[];
  warehouse_id: string;
}

export async function POST(req: NextRequest) {
  const session = await requireRole('admin', 'staff');

  const body = await req.json() as BillingPayload;
  const { type, party_name, invoice_date, items, warehouse_id } = body;

  if (!warehouse_id) {
    return NextResponse.json({ error: 'warehouse_id is required' }, { status: 400 });
  }
  if (!items?.length) {
    return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Resolve party ──────────────────────────────────────────────────────
    let partyId: string;
    if (type === 'purchase') {
      const partyName = party_name.trim() || 'Imported Supplier';
      const existing = await client.query(
        `SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [partyName]
      );
      if (existing.rows.length > 0) {
        partyId = existing.rows[0].id as string;
      } else {
        const created = await client.query(
          `INSERT INTO suppliers (name, phone, gstin, address) VALUES ($1,'N/A',NULL,'') RETURNING id`,
          [partyName]
        );
        partyId = created.rows[0].id as string;
      }
    } else {
      const partyName = party_name.trim() || 'Imported Customer';
      const existing = await client.query(
        `SELECT id FROM customers WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [partyName]
      );
      if (existing.rows.length > 0) {
        partyId = existing.rows[0].id as string;
      } else {
        const created = await client.query(
          `INSERT INTO customers (name, phone, gstin, address, credit_limit)
           VALUES ($1,NULL,NULL,'',0) RETURNING id`,
          [partyName]
        );
        partyId = created.rows[0].id as string;
      }
    }

    // ── Resolve items & calculate totals ───────────────────────────────────
    type LineCalc = {
      itemId: string; hsn: string | null;
      qty: number; rate: number; gstRate: number;
      taxable: number; cgst: number; sgst: number; total: number;
    };

    let subtotal = 0, totalCgst = 0, totalSgst = 0;
    const lines: LineCalc[] = [];

    for (const it of items) {
      if (!it.name.trim()) continue;
      const qty      = Math.max(0, parseFloat(it.quantity) || 0);
      const rate     = Math.max(0, parseFloat(it.rate)     || 0);
      const gstRate  = [0, 5, 12, 18, 28].includes(Number(it.gst_rate))
        ? Number(it.gst_rate) : 12;

      // Look up or create item
      let itemId: string, hsn: string | null = null;
      const existItem = await client.query(
        `SELECT id, hsn_code FROM items WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [it.name.trim()]
      );
      if (existItem.rows.length > 0) {
        itemId = existItem.rows[0].id as string;
        hsn    = existItem.rows[0].hsn_code as string | null;
      } else {
        const newItem = await client.query(
          `INSERT INTO items (name, hsn_code, item_type, gst_rate, unit, is_active)
           VALUES ($1, NULL, 'finished', $2, 'pcs', TRUE) RETURNING id`,
          [it.name.trim(), gstRate]
        );
        itemId = newItem.rows[0].id as string;
        await client.query(
          `INSERT INTO item_sizes (item_id, size_name, is_default, sort_order) VALUES ($1,'Regular',TRUE,0)`,
          [itemId]
        );
        await client.query(
          `INSERT INTO item_colors (item_id, color_name, is_default, sort_order) VALUES ($1,'Default',TRUE,0)`,
          [itemId]
        );
      }

      // Purchase invoices: rate is exclusive of GST
      const taxable = parseFloat((qty * rate).toFixed(2));
      const cgst    = parseFloat((taxable * gstRate / 200).toFixed(2));
      const sgst    = cgst;
      const total   = parseFloat((taxable + cgst + sgst).toFixed(2));

      subtotal   += taxable;
      totalCgst  += cgst;
      totalSgst  += sgst;
      lines.push({ itemId, hsn, qty, rate, gstRate, taxable, cgst, sgst, total });
    }

    const grandTotal = parseFloat((subtotal + totalCgst + totalSgst).toFixed(2));

    // ── Create invoice ─────────────────────────────────────────────────────
    if (type === 'purchase') {
      const purchaseNumber = await nextInvoiceNumber('PUR', client);
      const invRes = await client.query(
        `INSERT INTO purchase_invoices
           (purchase_number, supplier_id, warehouse_id, purchase_date, status,
            include_in_gst, subtotal, total_cgst, total_sgst, grand_total, created_by)
         VALUES ($1,$2,$3,$4,'draft',TRUE,$5,$6,$7,$8,$9) RETURNING id`,
        [purchaseNumber, partyId, warehouse_id, invoice_date,
         subtotal, totalCgst, totalSgst, grandTotal, session.userId]
      );
      const invId = invRes.rows[0].id as string;

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await client.query(
          `INSERT INTO purchase_invoice_items
             (purchase_invoice_id, item_id, variant_id, sort_order, quantity, rate,
              hsn_code, gst_rate, taxable_value, cgst_amount, sgst_amount, total_amount)
           VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [invId, l.itemId, i, l.qty, l.rate, l.hsn, l.gstRate,
           l.taxable, l.cgst, l.sgst, l.total]
        );
      }
    } else {
      // Sales invoice (draft)
      const invoiceNumber = await nextInvoiceNumber('INV', client);
      const invRes = await client.query(
        `INSERT INTO invoices
           (invoice_number, invoice_type, status, customer_id, warehouse_id,
            invoice_date, is_scheme_invoice, is_recurring, payment_mode, amount_paid,
            invoice_discount_type, invoice_discount_value, invoice_discount_amount,
            subtotal, total_cgst, total_sgst, grand_total, created_by)
         VALUES ($1,'gst','draft',$2,$3,$4,FALSE,FALSE,NULL,0,NULL,NULL,0,$5,$6,$7,$8,$9)
         RETURNING id`,
        [invoiceNumber, partyId, warehouse_id, invoice_date,
         subtotal, totalCgst, totalSgst, grandTotal, session.userId]
      );
      const invId = invRes.rows[0].id as string;

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await client.query(
          `INSERT INTO invoice_items
             (invoice_id, item_id, variant_id, sort_order, quantity, rate,
              discount_type, discount_value, discount_amount,
              hsn_code, gst_rate, taxable_value, cgst_amount, sgst_amount, total_amount)
           VALUES ($1,$2,NULL,$3,$4,$5,NULL,NULL,0,$6,$7,$8,$9,$10,$11)`,
          [invId, l.itemId, i, l.qty, l.rate, l.hsn, l.gstRate,
           l.taxable, l.cgst, l.sgst, l.total]
        );
      }
    }

    await client.query('COMMIT');
    return NextResponse.json({ saved: 1, skipped: 0, errors: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
