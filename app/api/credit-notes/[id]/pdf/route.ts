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

  const [cnRes, lineRes, settingsRes] = await Promise.all([
    query(
      `SELECT cn.*, c.name AS customer_name, c.address AS customer_address, c.gstin AS customer_gstin,
              c.phone AS customer_phone, inv.invoice_number AS original_invoice_number
       FROM credit_notes cn
       LEFT JOIN customers c ON c.id=cn.customer_id
       LEFT JOIN invoices inv ON inv.id=cn.invoice_id
       WHERE cn.id=$1`,
      [params.id]
    ),
    query(
      `SELECT cni.*, it.name AS item_name, it.unit,
              iv.size AS iv_size, iv.color AS iv_color
       FROM credit_note_items cni
       JOIN items it ON it.id=cni.item_id
       LEFT JOIN item_variants iv ON iv.id=cni.variant_id
       WHERE cni.credit_note_id=$1 ORDER BY cni.id`,
      [params.id]
    ),
    query<{ key: string; value: string }>('SELECT key, value FROM settings'),
  ]);

  if (!cnRes.rows[0]) return new NextResponse('Not found', { status: 404 });

  const cn = cnRes.rows[0];
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
    docType: 'CREDIT NOTE',
    invoiceNumber: cn.credit_note_number,
    invoiceDate: fmtDate(cn.created_at ?? new Date()),
    company: {
      name: settings.company_name ?? 'Sutra Collections',
      gstin: settings.company_gstin ?? '',
      address: settings.company_address ?? '',
      state: settings.company_state ?? 'Karnataka',
      phone: settings.company_phone || undefined,
      email: settings.company_email || undefined,
      logoAbsPath,
    },
    customer: {
      name: cn.customer_name ?? 'Walk-in Customer',
      address: cn.customer_address ?? '',
      gstin: cn.customer_gstin,
      phone: cn.customer_phone || undefined,
    },
    originalInvoiceNumber: cn.original_invoice_number || undefined,
    refundMode:
      cn.resolution === 'loyalty_points' ? 'Loyalty Points'
        : cn.resolution === 'store_credit' ? 'Store Credit'
        : cn.resolution === 'refund' ? 'Direct Refund'
        : undefined,
    items: lineRes.rows.map((l) => {
      const variant = [l.iv_color, l.iv_size].filter(Boolean).join(' / ');
      return {
        description: l.item_name,
        variant: variant || undefined,
        hsn: l.hsn_code ?? '',
        qty: Number(l.quantity),
        unit: l.unit,
        rate: Number(l.rate),
        discountAmount: 0,
        gstRate: Number(l.gst_rate),
        taxableValue: Number(l.taxable_value),
        cgst: Number(l.cgst_amount),
        sgst: Number(l.sgst_amount),
        total: Number(l.total_amount),
      };
    }),
    invoiceDiscountAmount: 0,
    subtotal: Number(cn.subtotal),
    totalCgst: Number(cn.total_cgst),
    totalSgst: Number(cn.total_sgst),
    grandTotal: Number(cn.grand_total),
    amountPaid: 0,
    paymentMode: undefined,
    notes: cn.reason ?? undefined,
    isScheme: false,
  };

  const buffer = await renderInvoicePdf(data);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${cn.credit_note_number}.pdf"`,
    },
  });
}
