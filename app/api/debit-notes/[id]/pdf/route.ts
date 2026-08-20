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

  const [dnRes, lineRes, settingsRes] = await Promise.all([
    query(
      `SELECT dn.*, s.name AS supplier_name, s.address AS supplier_address, s.gstin AS supplier_gstin
       FROM debit_notes dn JOIN suppliers s ON s.id=dn.supplier_id WHERE dn.id=$1`,
      [params.id]
    ),
    query(
      `SELECT dni.*, it.name AS item_name, it.unit,
              iv.size AS iv_size, iv.color AS iv_color
       FROM debit_note_items dni
       JOIN items it ON it.id=dni.item_id
       LEFT JOIN item_variants iv ON iv.id=dni.variant_id
       WHERE dni.debit_note_id=$1 ORDER BY dni.id`,
      [params.id]
    ),
    query<{ key: string; value: string }>('SELECT key, value FROM settings'),
  ]);

  if (!dnRes.rows[0]) return new NextResponse('Not found', { status: 404 });

  const dn = dnRes.rows[0];
  const settings = Object.fromEntries(settingsRes.rows.map((r) => [r.key, r.value]));

  const customTerms = (settings.terms_and_conditions ?? '')
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean);

  const rawLogoPath = settings.company_logo_path ?? '';
  const logoAbsPath = rawLogoPath
    ? (() => {
        const p = path.join(process.cwd(), 'public', rawLogoPath);
        return fs.existsSync(p) ? p : undefined;
      })()
    : undefined;

  const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-IN');

  const data: PdfInvoiceData = {
    docType: 'DEBIT NOTE',
    invoiceNumber: dn.debit_note_number,
    invoiceDate: fmtDate(dn.created_at ?? new Date()),
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
      name: dn.supplier_name ?? 'Unknown Supplier',
      address: dn.supplier_address ?? '',
      gstin: dn.supplier_gstin,
    },
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
    subtotal: Number(dn.subtotal),
    totalCgst: Number(dn.total_cgst),
    totalSgst: Number(dn.total_sgst),
    grandTotal: Number(dn.grand_total),
    amountPaid: 0,
    paymentMode: undefined,
    notes: dn.reason ?? undefined,
    isScheme: false,
    customTerms: customTerms.length > 0 ? customTerms : undefined,
  };

  const buffer = await renderInvoicePdf(data);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${dn.debit_note_number}.pdf"`,
    },
  });
}
