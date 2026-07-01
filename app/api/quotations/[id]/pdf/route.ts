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

  const [qRes, lineRes, settingsRes] = await Promise.all([
    query(
      `SELECT q.*, c.name AS customer_name, c.address AS customer_address, c.gstin AS customer_gstin
       FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.id=$1`, [params.id]
    ),
    query(
      `SELECT qi.*, it.name AS item_name, it.unit, iv.size, iv.color FROM quotation_items qi
       JOIN items it ON it.id=qi.item_id LEFT JOIN item_variants iv ON iv.id=qi.variant_id
       WHERE qi.quotation_id=$1 ORDER BY qi.sort_order`, [params.id]
    ),
    query<{ key: string; value: string }>('SELECT key, value FROM settings'),
  ]);

  if (!qRes.rows[0]) return new NextResponse('Not found', { status: 404 });

  const q        = qRes.rows[0];
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
    docType:       'QUOTATION',
    invoiceNumber: q.quotation_number,
    invoiceDate:   fmtDate(q.created_at),
    dueDate:       q.valid_until ? `Valid until: ${fmtDate(q.valid_until)}` : undefined,
    company: {
      name:    settings.company_name ?? 'Sutra Collections',
      gstin:   settings.company_gstin ?? '',
      address: settings.company_address ?? '',
      state:   settings.company_state ?? 'Karnataka',
      phone:   settings.company_phone || undefined,
      email:   settings.company_email || undefined,
      logoAbsPath,
    },
    customer: {
      name:    q.customer_name ?? 'Walk-in Customer',
      address: q.customer_address ?? '',
      gstin:   q.customer_gstin,
    },
    items: lineRes.rows.map((l) => ({
      description:    `${l.item_name}${l.color || l.size ? ` (${[l.color, l.size].filter(Boolean).join('/')})` : ''}`,
      hsn:            l.hsn_code ?? '',
      qty:            Number(l.quantity),
      unit:           l.unit,
      rate:           Number(l.rate),
      discountAmount: Number(l.discount_amount ?? 0),
      gstRate:        Number(l.gst_rate),
      taxableValue:   Number(l.taxable_value),
      cgst:           Number(l.cgst_amount),
      sgst:           Number(l.sgst_amount),
      total:          Number(l.total_amount),
    })),
    invoiceDiscountAmount: 0,
    subtotal:   Number(q.subtotal),
    totalCgst:  Number(q.total_cgst),
    totalSgst:  Number(q.total_sgst),
    grandTotal: Number(q.grand_total),
  };

  const buffer = await renderInvoicePdf(data);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${q.quotation_number}.pdf"`,
    },
  });
}
