import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { verifySession } from '@/lib/session';
import { query } from '@/lib/db';
import { renderThermalPdf } from '@/lib/pdf/thermal-template';
import type { PdfInvoiceData } from '@/lib/pdf/invoice-template';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const cookie = req.cookies.get('sutra_session')?.value;
  if (!cookie) return new NextResponse('Unauthorized', { status: 401 });
  const session = await verifySession(cookie).catch(() => null);
  if (!session) return new NextResponse('Unauthorized', { status: 401 });

  const [invRes, lineRes, settingsRes] = await Promise.all([
    query(
      `SELECT i.*, c.name AS customer_name, c.address AS customer_address, c.phone AS customer_phone
       FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.id=$1`, [params.id]
    ),
    query(
      `SELECT ii.*, it.name AS item_name, it.unit,
              iv.size AS iv_size, iv.color AS iv_color,
              isz.size_name, ic.color_name
       FROM invoice_items ii
       JOIN items it ON it.id=ii.item_id
       LEFT JOIN item_variants iv ON iv.id=ii.variant_id
       LEFT JOIN item_sizes isz ON isz.id=ii.size_id
       LEFT JOIN item_colors ic ON ic.id=ii.color_id
       WHERE ii.invoice_id=$1 ORDER BY ii.sort_order`, [params.id]
    ),
    query<{ key: string; value: string }>('SELECT key, value FROM settings'),
  ]);

  if (!invRes.rows[0]) return new NextResponse('Not found', { status: 404 });

  const inv      = invRes.rows[0];
  const settings = Object.fromEntries(settingsRes.rows.map((r) => [r.key, r.value]));

  const rawLogoPath = settings.company_logo_path ?? '';
  const logoAbsPath = rawLogoPath
    ? (() => {
        const p = path.join(process.cwd(), 'public', rawLogoPath);
        return fs.existsSync(p) ? p : undefined;
      })()
    : undefined;

  // Thermal: convert logo to data URL to avoid page-split bug with file-path images on auto-height pages
  const logoDataUrl = logoAbsPath
    ? `data:image/${path.extname(logoAbsPath).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(logoAbsPath).toString('base64')}`
    : undefined;

  const upiVpa      = settings.upi_vpa ?? '';
  const balance     = Math.max(0, Number(inv.grand_total) - Number(inv.amount_paid));
  let upiQrDataUrl: string | undefined;
  if (upiVpa && balance > 0) {
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiVpa)}&am=${balance.toFixed(2)}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`;
    upiQrDataUrl = await QRCode.toDataURL(upiUri, { width: 80, margin: 1 });
  }

  const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-IN');

  const data: PdfInvoiceData = {
    docType:       'INVOICE',
    invoiceNumber: inv.invoice_number,
    invoiceDate:   fmtDate(inv.invoice_date),
    company: {
      name:    settings.company_name ?? 'Sutra Collections',
      gstin:   settings.company_gstin ?? '',
      address: settings.company_address ?? '',
      state:   settings.company_state ?? 'Karnataka',
      phone:   settings.company_phone || undefined,
    },
    customer: {
      name:    inv.customer_name ?? 'Walk-in Customer',
      address: inv.customer_address ?? '',
      phone:   inv.customer_phone || undefined,
    },
    items: lineRes.rows.map((l) => {
      const newVariant = [l.color_name, l.size_name]
        .filter((v: string | null) => v && v !== 'None' && v !== 'Regular').join(' / ');
      const oldVariant = [l.iv_color, l.iv_size].filter(Boolean).join(' / ');
      return {
        description:    l.item_name,
        variant:        newVariant || oldVariant || undefined,
        hsn:            l.hsn_code ?? '',
        qty:            Number(l.quantity),
        unit:           l.unit,
        rate:           Number(l.rate),
        discountAmount: Number(l.discount_amount),
        gstRate:        Number(l.gst_rate),
        taxableValue:   Number(l.taxable_value),
        cgst:           Number(l.cgst_amount),
        sgst:           Number(l.sgst_amount),
        total:          Number(l.total_amount),
      };
    }),
    invoiceDiscountAmount: Number(inv.invoice_discount_amount),
    subtotal:    Number(inv.subtotal),
    totalCgst:   Number(inv.total_cgst),
    totalSgst:   Number(inv.total_sgst),
    grandTotal:  Number(inv.grand_total),
    amountPaid:  Number(inv.amount_paid),
    paymentMode: inv.payment_mode,
    schemeDiscount:  Number(inv.scheme_discount_amount ?? 0),
    loyaltyDiscount: Number(inv.loyalty_discount_amount ?? inv.loyalty_points_redeemed ?? 0),
    loyaltyPoints:   Number(inv.loyalty_points_redeemed ?? 0),
    upiVpa:      upiVpa || undefined,
    upiQrDataUrl,
  };

  const buffer = await renderThermalPdf(data, logoDataUrl);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${inv.invoice_number}-thermal.pdf"`,
    },
  });
}
