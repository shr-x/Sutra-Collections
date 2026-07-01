import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { verifySession } from '@/lib/session';
import { query } from '@/lib/db';
import { renderInvoicePdf } from '@/lib/pdf/invoice-template';
import type { PdfInvoiceData } from '@/lib/pdf/invoice-template';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const cookie = req.cookies.get('sutra_session')?.value;
  if (!cookie) return new NextResponse('Unauthorized', { status: 401 });
  const session = await verifySession(cookie).catch(() => null);
  if (!session) return new NextResponse('Unauthorized', { status: 401 });

  const [purRes, lineRes, settingsRes] = await Promise.all([
    query(
      `SELECT p.*, s.name AS supplier_name, s.address AS supplier_address,
              s.gstin AS supplier_gstin, w.name AS warehouse_name
       FROM purchase_invoices p
       JOIN suppliers s ON s.id=p.supplier_id
       JOIN warehouses w ON w.id=p.warehouse_id
       WHERE p.id=$1`, [params.id]
    ),
    query(
      `SELECT pii.*, it.name AS item_name, it.unit,
              isz.size_name, ic.color_name
       FROM purchase_invoice_items pii
       JOIN items it ON it.id=pii.item_id
       LEFT JOIN item_sizes isz ON isz.id=pii.size_id
       LEFT JOIN item_colors ic ON ic.id=pii.color_id
       WHERE pii.purchase_invoice_id=$1 ORDER BY pii.sort_order`, [params.id]
    ),
    query<{ key: string; value: string }>('SELECT key, value FROM settings'),
  ]);

  if (!purRes.rows[0]) return new NextResponse('Not found', { status: 404 });

  const pur     = purRes.rows[0];
  const settings = Object.fromEntries(settingsRes.rows.map((r) => [r.key, r.value]));

  const rawLogoPath = settings.company_logo_path ?? '';
  const logoAbsPath = rawLogoPath
    ? (() => {
        const p = path.join(process.cwd(), 'public', rawLogoPath);
        return fs.existsSync(p) ? p : undefined;
      })()
    : undefined;

  const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-IN');

  const data: PdfInvoiceData = {
    docType:       'PURCHASE',
    invoiceNumber: pur.purchase_number,
    invoiceDate:   fmtDate(pur.purchase_date),
    dueDate:       pur.supplier_invoice_number ? `Supplier Bill: ${pur.supplier_invoice_number}` : undefined,
    company: {
      name:       settings.company_name ?? 'Sutra Collections',
      gstin:      settings.company_gstin ?? '',
      address:    settings.company_address ?? '',
      state:      settings.company_state ?? 'Karnataka',
      phone:      settings.company_phone || undefined,
      email:      settings.company_email || undefined,
      logoAbsPath,
    },
    customer: {
      name:    pur.supplier_name,
      address: pur.supplier_address ?? '',
      gstin:   pur.supplier_gstin,
    },
    items: lineRes.rows.map((l) => {
      const varParts = [l.color_name, l.size_name]
        .filter((v: string | null) => v && v !== 'None' && v !== 'Regular');
      return {
        description:    l.item_name,
        variant:        varParts.length > 0 ? varParts.join(' / ') : undefined,
        hsn:            l.hsn_code ?? '',
        qty:            Number(l.quantity),
        unit:           l.unit,
        rate:           Number(l.rate),
        discountAmount: 0,
        gstRate:        Number(l.gst_rate),
        taxableValue:   Number(l.taxable_value),
        cgst:           Number(l.cgst_amount),
        sgst:           Number(l.sgst_amount),
        total:          Number(l.total_amount),
      };
    }),
    invoiceDiscountAmount: 0,
    subtotal:    Number(pur.subtotal),
    totalCgst:   Number(pur.total_cgst),
    totalSgst:   Number(pur.total_sgst),
    grandTotal:  Number(pur.grand_total),
    amountPaid:  Number(pur.amount_paid),
    paymentMode: pur.payment_mode,
    notes:       pur.notes,
  };

  const buffer = await renderInvoicePdf(data);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pur.purchase_number}.pdf"`,
    },
  });
}
