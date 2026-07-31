/**
 * PDF generation utility — builds PDFs from DB data and writes to /tmp/.
 * Returns the absolute file path or null on failure (non-fatal).
 */
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { query } from '@/lib/db';
import { calcLine, calcInvoiceTotals } from '@/lib/gst';
import { renderInvoicePdf } from '@/lib/pdf/invoice-template';
import type { PdfCompany, PdfInvoiceData } from '@/lib/pdf/invoice-template';
import { renderThermalPdf } from '@/lib/pdf/thermal-template';
import {
  renderTailoringPdf,
  renderGroupedTailoringPdf,
  type GroupedTailoringPdfInput,
  type TailoringLineItem,
} from '@/lib/pdf/tailoring-template';

const fmtDate = (d: string | Date | null): string =>
  d ? new Date(d).toLocaleDateString('en-IN') : '';

async function getCompany(): Promise<PdfCompany & { upiVpa: string; termsAndConditions: string[] }> {
  const { rows } = await query<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const rawLogo = s.company_logo_path ?? '';
  const logoAbsPath = rawLogo
    ? (() => {
        const p = path.join(process.cwd(), 'public', rawLogo);
        return fs.existsSync(p) ? p : undefined;
      })()
    : undefined;

  const termsAndConditions = (s.terms_and_conditions ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    name: s.company_name ?? 'Sutra Collections',
    gstin: s.company_gstin ?? '',
    address: s.company_address ?? '',
    state: s.company_state ?? 'Karnataka',
    phone: s.company_phone || undefined,
    email: s.company_email || undefined,
    logoAbsPath,
    upiVpa: s.upi_vpa ?? '',
    termsAndConditions,
  };
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export async function generateInvoicePdf(invoiceId: string): Promise<string | null> {
  try {
    const [invRes, lineRes] = await Promise.all([
      query(
        `SELECT i.*, c.name AS customer_name, c.address AS customer_address,
                c.gstin AS customer_gstin, c.phone AS customer_phone
         FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.id=$1`,
        [invoiceId]
      ),
      query(
        `SELECT ii.*, COALESCE(ii.description_override, it.name) AS item_name, it.unit,
                isz.size_name, ic.color_name
         FROM invoice_items ii
         JOIN items it ON it.id=ii.item_id
         LEFT JOIN item_sizes isz ON isz.id=ii.size_id
         LEFT JOIN item_colors ic ON ic.id=ii.color_id
         WHERE ii.invoice_id=$1 ORDER BY ii.sort_order`,
        [invoiceId]
      ),
    ]);

    if (!invRes.rows[0]) return null;
    const inv = invRes.rows[0];
    const co = await getCompany();

    let upiQrDataUrl: string | undefined;
    const balance = Math.max(0, Number(inv.grand_total) - Number(inv.amount_paid));
    if (co.upiVpa && balance > 0) {
      const uri = `upi://pay?pa=${encodeURIComponent(co.upiVpa)}&am=${balance.toFixed(2)}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`;
      upiQrDataUrl = await QRCode.toDataURL(uri, { width: 128, margin: 1 });
    }

    const buffer = await renderInvoicePdf({
      docType: 'INVOICE',
      invoiceNumber: inv.invoice_number,
      invoiceDate: fmtDate(inv.invoice_date),
      dueDate: inv.due_date ? fmtDate(inv.due_date) : undefined,
      company: {
        name: co.name, gstin: co.gstin, address: co.address,
        state: co.state, phone: co.phone, email: co.email, logoAbsPath: co.logoAbsPath,
      },
      customer: {
        name: inv.customer_name ?? 'Walk-in Customer',
        address: inv.customer_address ?? '',
        gstin: inv.customer_gstin,
        phone: inv.customer_phone || undefined,
      },
      items: lineRes.rows.map((l) => {
        const variant = [l.color_name, l.size_name]
          .filter((v: string | null) => v && v !== 'None' && v !== 'Regular').join(' / ');
        return {
          description: l.item_name, variant: variant || undefined,
          hsn: l.hsn_code ?? '', qty: Number(l.quantity), unit: l.unit,
          rate: Number(l.rate), discountAmount: Number(l.discount_amount),
          gstRate: Number(l.gst_rate), taxableValue: Number(l.taxable_value),
          cgst: Number(l.cgst_amount), sgst: Number(l.sgst_amount), total: Number(l.total_amount),
        };
      }),
      invoiceDiscountAmount: Number(inv.invoice_discount_amount),
      subtotal: Number(inv.subtotal),
      totalCgst: Number(inv.total_cgst),
      totalSgst: Number(inv.total_sgst),
      grandTotal: Number(inv.grand_total),
      amountPaid: Number(inv.amount_paid),
      paymentMode: inv.payment_mode || undefined,
      notes: inv.notes || undefined,
      isScheme: inv.is_scheme_invoice,
      upiVpa: co.upiVpa || undefined,
      upiQrDataUrl,
      schemeDiscount: Number(inv.scheme_discount_amount ?? 0),
      loyaltyDiscount: Number(inv.loyalty_discount_amount ?? 0),
      loyaltyPoints: Number(inv.loyalty_points_redeemed ?? 0),
      customTerms: co.termsAndConditions.length > 0 ? co.termsAndConditions : undefined,
    });

    const safe = inv.invoice_number.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/invoice_${safe}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateInvoicePdf failed:', err);
    return null;
  }
}

// Receipt reuses invoice PDF (same data, payment is already recorded)
export const generateReceiptPdf = generateInvoicePdf;

// ─── Tailoring Proforma (order creation AND ready-for-pickup balance update —
// NEITHER is a real tax invoice) ──────────────────────────────────────────────
// Sourced directly from tailoring_orders (never from invoices/invoice_items —
// the real GST invoice lives separately, see lib/tailoring-invoice.ts, and this
// function never posts to accounting).
//
// Group-aware: if the order was booked together with others under the same
// group_number (a multi-item booking session), ALL sibling orders are combined
// into ONE document with a per-item breakdown and a single combined total —
// same convention as generateTailoringCustomerPdf. This matters because the
// wizard suppresses the per-order WhatsApp send for every item in a batch and
// fires this once for the whole group instead (see sendBatchConfirmationAction
// in app/(auth)/tailoring/actions.ts) — a single-item proforma would only have
// shown one of several booked items with an incomplete total.
export async function generateTailoringProformaPdf(
  orderId: string,
  opts?: { variant?: 'initial' | 'balance_update' }
): Promise<string | null> {
  try {
    const variant = opts?.variant ?? 'initial';

    const { rows: anchorRows } = await query<{
      order_number: string; group_number: string | null;
      customer_name: string; customer_address: string | null; customer_gstin: string | null; customer_phone: string | null;
    }>(
      `SELECT o.order_number, o.group_number,
              c.name AS customer_name, c.address AS customer_address, c.gstin AS customer_gstin, c.phone AS customer_phone
       FROM tailoring_orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id=$1`,
      [orderId]
    );
    const anchor = anchorRows[0];
    if (!anchor) return null;
    const co = await getCompany();

    let siblingIds = [orderId];
    if (anchor.group_number) {
      const groupRes = await query<{ id: string }>(
        `SELECT id FROM tailoring_orders WHERE group_number=$1 ORDER BY suffix ASC, created_at ASC`,
        [anchor.group_number]
      );
      if (groupRes.rows.length > 0) siblingIds = groupRes.rows.map((r) => r.id);
    }

    const { rows: siblings } = await query<{
      total_amount: string; amount_paid: string; gst_rate: string; created_at: string;
      notes: string | null; design_name: string; order_number: string; suffix: string | null;
    }>(
      `SELECT o.total_amount::text, o.amount_paid::text, o.gst_rate::text, o.created_at::text,
              o.notes, o.order_number, o.suffix, d.name AS design_name
       FROM tailoring_orders o JOIN designs d ON d.id = o.design_id
       WHERE o.id = ANY($1::uuid[])
       ORDER BY o.suffix ASC, o.created_at ASC`,
      [siblingIds]
    );
    if (!siblings.length) return null;

    const lineResults = siblings.map((s) => calcLine({
      quantity: 1, rate: Number(s.total_amount), gstRate: Number(s.gst_rate), isScheme: false,
    }));
    const totals = calcInvoiceTotals(lineResults);
    const amountPaid = siblings.reduce((sum, s) => sum + Number(s.amount_paid), 0);
    const displayRef = anchor.group_number ?? anchor.order_number;

    // Real order notes/special-instructions (#3) — never an auto-generated
    // "Reference: <order_number>"-style placeholder. Omitted entirely if no
    // sibling has one filled in. Multi-item bookings prefix each note with
    // its design name so staff/customer can tell which item it applies to.
    const notesEntries = siblings
      .filter((s) => s.notes?.trim())
      .map((s) => (siblings.length > 1 ? `${s.design_name}: ${s.notes!.trim()}` : s.notes!.trim()));
    const combinedNotes = notesEntries.length > 0 ? notesEntries.join('\n') : undefined;

    const proformaSubtitle = variant === 'balance_update'
      ? 'PROFORMA — BALANCE UPDATE (NOT A GST TAX INVOICE)'
      : undefined; // falls back to the template's default initial-estimate wording

    const buffer = await renderInvoicePdf({
      docType: 'PROFORMA',
      proformaSubtitle,
      invoiceNumber: displayRef,
      invoiceDate: fmtDate(siblings[0].created_at),
      company: {
        name: co.name, gstin: co.gstin, address: co.address,
        state: co.state, phone: co.phone, email: co.email, logoAbsPath: co.logoAbsPath,
      },
      customer: {
        name: anchor.customer_name,
        address: anchor.customer_address ?? '',
        gstin: anchor.customer_gstin ?? undefined,
        phone: anchor.customer_phone || undefined,
      },
      items: siblings.map((s, i) => ({
        description: s.design_name, hsn: '9988', qty: 1, unit: 'pcs',
        rate: Number(s.total_amount), discountAmount: 0, gstRate: Number(s.gst_rate),
        taxableValue: lineResults[i].taxableValue, cgst: lineResults[i].cgstAmount,
        sgst: lineResults[i].sgstAmount, total: lineResults[i].totalAmount,
      })),
      invoiceDiscountAmount: 0,
      subtotal: totals.subtotal,
      totalCgst: totals.totalCgst,
      totalSgst: totals.totalSgst,
      grandTotal: totals.grandTotal,
      amountPaid,
      notes: combinedNotes,
      customTerms: co.termsAndConditions.length > 0 ? co.termsAndConditions : undefined,
    });

    const safe = `${displayRef}_${variant}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/proforma_${safe}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateTailoringProformaPdf failed:', err);
    return null;
  }
}

// ─── Tailoring "Credit Due" notice (Mark Delivered On Credit) ────────────────
// Reuses the CREDIT NOTE visual template for consistency with the rest of the
// app's document styling — but this is NOT a real accounting credit note and
// never touches the credit_notes table or postCreditNote(): a real credit note
// is specifically a DECREASE (refund/sales-return), whereas this represents
// the OPPOSITE — an amount now owed BY the customer (added to their dues) when
// a tailoring order is delivered before it's fully paid. Inserting this into
// credit_notes would incorrectly reduce recognised sales revenue in GSTR-1/
// accounting reports for revenue that was already correctly recognised via the
// order's real GST invoice. The creditNoteSubtitle override makes sure the
// printed document doesn't claim to be a refund.
export async function generateTailoringCreditDuePdf(orderId: string): Promise<string | null> {
  try {
    const { rows } = await query<{
      order_number: string; group_number: string | null; credit_amount: string;
      customer_name: string; customer_address: string | null; customer_gstin: string | null; customer_phone: string | null;
    }>(
      `SELECT o.order_number, o.group_number, o.credit_amount::text,
              c.name AS customer_name, c.address AS customer_address, c.gstin AS customer_gstin, c.phone AS customer_phone
       FROM tailoring_orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id=$1`,
      [orderId]
    );
    const order = rows[0];
    if (!order) return null;
    const creditAmount = Number(order.credit_amount);
    if (creditAmount <= 0) return null;
    const co = await getCompany();
    const displayRef = order.group_number ?? order.order_number;

    const buffer = await renderInvoicePdf({
      docType: 'CREDIT NOTE',
      creditNoteSubtitle: 'ADDED TO CUSTOMER DUES — NOT A REFUND',
      invoiceNumber: `${displayRef}-CR`,
      invoiceDate: fmtDate(new Date()),
      originalInvoiceNumber: displayRef,
      company: {
        name: co.name, gstin: co.gstin, address: co.address,
        state: co.state, phone: co.phone, email: co.email, logoAbsPath: co.logoAbsPath,
      },
      customer: {
        name: order.customer_name,
        address: order.customer_address ?? '',
        gstin: order.customer_gstin ?? undefined,
        phone: order.customer_phone || undefined,
      },
      items: [{
        description: `Balance carried to dues — Tailoring Order ${displayRef}`,
        hsn: '', qty: 1, unit: 'pcs', rate: creditAmount, discountAmount: 0, gstRate: 0,
        taxableValue: creditAmount, cgst: 0, sgst: 0, total: creditAmount,
      }],
      invoiceDiscountAmount: 0,
      subtotal: creditAmount,
      totalCgst: 0,
      totalSgst: 0,
      grandTotal: creditAmount,
      notes: `This amount has been added to your outstanding dues for order ${displayRef}. Please clear at your earliest convenience.`,
      customTerms: co.termsAndConditions.length > 0 ? co.termsAndConditions : undefined,
    });

    const safe = `${displayRef}-CR`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/tailoring_credit_${safe}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateTailoringCreditDuePdf failed:', err);
    return null;
  }
}

// ─── Thermal Invoice (for WhatsApp sends — narrow, single-page, B&W) ─────────

export async function generateThermalInvoicePdf(invoiceId: string): Promise<string | null> {
  try {
    const [invRes, lineRes] = await Promise.all([
      query(
        `SELECT i.*, c.name AS customer_name, c.address AS customer_address,
                c.gstin AS customer_gstin, c.phone AS customer_phone
         FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.id=$1`,
        [invoiceId]
      ),
      query(
        `SELECT ii.*, COALESCE(ii.description_override, it.name) AS item_name, it.unit,
                isz.size_name, ic.color_name
         FROM invoice_items ii
         JOIN items it ON it.id=ii.item_id
         LEFT JOIN item_sizes isz ON isz.id=ii.size_id
         LEFT JOIN item_colors ic ON ic.id=ii.color_id
         WHERE ii.invoice_id=$1 ORDER BY ii.sort_order`,
        [invoiceId]
      ),
    ]);

    if (!invRes.rows[0]) return null;
    const inv = invRes.rows[0];
    const co = await getCompany();

    // Thermal must use base64 data URL — file-path images cause a react-pdf page-split bug
    const logoDataUrl = co.logoAbsPath
      ? `data:image/${path.extname(co.logoAbsPath).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(co.logoAbsPath).toString('base64')}`
      : undefined;

    const grandTotal = Number(inv.grand_total);
    let upiQrDataUrl: string | undefined;
    if (co.upiVpa) {
      const uri = `upi://pay?pa=${encodeURIComponent(co.upiVpa)}&pn=${encodeURIComponent(co.name)}&am=${grandTotal.toFixed(2)}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`;
      upiQrDataUrl = await QRCode.toDataURL(uri, { width: 80, margin: 1 });
    }

    const data: PdfInvoiceData = {
      docType: 'INVOICE',
      invoiceNumber: inv.invoice_number,
      invoiceDate: fmtDate(inv.invoice_date),
      company: {
        name: co.name, gstin: co.gstin, address: co.address,
        state: co.state, phone: co.phone, email: co.email,
      },
      customer: {
        name: inv.customer_name ?? 'Walk-in Customer',
        address: inv.customer_address ?? '',
        gstin: inv.customer_gstin,
        phone: inv.customer_phone || undefined,
      },
      items: lineRes.rows.map((l) => {
        const variant = [l.color_name, l.size_name]
          .filter((v: string | null) => v && v !== 'None' && v !== 'Regular').join(' / ');
        return {
          description: l.item_name, variant: variant || undefined,
          hsn: l.hsn_code ?? '', qty: Number(l.quantity), unit: l.unit,
          rate: Number(l.rate), discountAmount: Number(l.discount_amount),
          gstRate: Number(l.gst_rate), taxableValue: Number(l.taxable_value),
          cgst: Number(l.cgst_amount), sgst: Number(l.sgst_amount), total: Number(l.total_amount),
        };
      }),
      invoiceDiscountAmount: Number(inv.invoice_discount_amount),
      subtotal: Number(inv.subtotal),
      totalCgst: Number(inv.total_cgst),
      totalSgst: Number(inv.total_sgst),
      grandTotal,
      amountPaid: Number(inv.amount_paid),
      paymentMode: inv.payment_mode || undefined,
      upiVpa: co.upiVpa || undefined,
      upiQrDataUrl,
      schemeDiscount: Number(inv.scheme_discount_amount ?? 0),
      loyaltyDiscount: Number(inv.loyalty_discount_amount ?? 0),
      loyaltyPoints: Number(inv.loyalty_points_redeemed ?? 0),
      customTerms: co.termsAndConditions.length > 0 ? co.termsAndConditions : undefined,
    };

    const buffer = await renderThermalPdf(data, logoDataUrl);
    const safe = inv.invoice_number.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/thermal_${safe}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateThermalInvoicePdf failed:', err);
    return null;
  }
}

// ─── Credit Note ─────────────────────────────────────────────────────────────

export async function generateCreditNotePdf(cnId: string): Promise<string | null> {
  try {
    const [cnRes, lineRes] = await Promise.all([
      query(
        `SELECT cn.*, c.name AS customer_name, c.address AS customer_address,
                c.gstin AS customer_gstin, c.phone AS customer_phone,
                i.invoice_number AS orig_invoice_number
         FROM credit_notes cn
         LEFT JOIN customers c ON c.id=cn.customer_id
         LEFT JOIN invoices i ON i.id=cn.invoice_id
         WHERE cn.id=$1`,
        [cnId]
      ),
      query(
        `SELECT cni.*, it.name AS item_name, it.unit
         FROM credit_note_items cni
         JOIN items it ON it.id=cni.item_id
         WHERE cni.credit_note_id=$1`,
        [cnId]
      ),
    ]);

    if (!cnRes.rows[0]) return null;
    const cn = cnRes.rows[0];
    const co = await getCompany();

    const buffer = await renderInvoicePdf({
      docType: 'CREDIT NOTE',
      invoiceNumber: cn.credit_note_number,
      invoiceDate: fmtDate(cn.created_at),
      originalInvoiceNumber: cn.orig_invoice_number || undefined,
      refundMode: cn.resolution || undefined,
      company: {
        name: co.name, gstin: co.gstin, address: co.address,
        state: co.state, phone: co.phone, email: co.email, logoAbsPath: co.logoAbsPath,
      },
      customer: {
        name: cn.customer_name ?? 'Customer',
        address: cn.customer_address ?? '',
        gstin: cn.customer_gstin,
        phone: cn.customer_phone || undefined,
      },
      items: lineRes.rows.map((l) => ({
        description: l.item_name, hsn: l.hsn_code ?? '',
        qty: Number(l.quantity), unit: l.unit, rate: Number(l.rate),
        discountAmount: 0, gstRate: Number(l.gst_rate),
        taxableValue: Number(l.taxable_value), cgst: Number(l.cgst_amount),
        sgst: Number(l.sgst_amount), total: Number(l.total_amount),
      })),
      invoiceDiscountAmount: 0,
      subtotal: Number(cn.subtotal),
      totalCgst: Number(cn.total_cgst),
      totalSgst: Number(cn.total_sgst),
      grandTotal: Number(cn.grand_total),
    });

    const safe = cn.credit_note_number.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/credit_note_${safe}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateCreditNotePdf failed:', err);
    return null;
  }
}

// ─── Debit Note ──────────────────────────────────────────────────────────────

export async function generateDebitNotePdf(dnId: string): Promise<string | null> {
  try {
    const [dnRes, lineRes] = await Promise.all([
      query(
        `SELECT dn.*, s.name AS supplier_name, s.address AS supplier_address,
                s.gstin AS supplier_gstin, s.phone AS supplier_phone,
                pi.purchase_number AS orig_purchase_number
         FROM debit_notes dn
         LEFT JOIN suppliers s ON s.id=dn.supplier_id
         LEFT JOIN purchase_invoices pi ON pi.id=dn.purchase_invoice_id
         WHERE dn.id=$1`,
        [dnId]
      ),
      query(
        `SELECT dni.*, it.name AS item_name, it.unit
         FROM debit_note_items dni
         JOIN items it ON it.id=dni.item_id
         WHERE dni.debit_note_id=$1`,
        [dnId]
      ),
    ]);

    if (!dnRes.rows[0]) return null;
    const dn = dnRes.rows[0];
    const co = await getCompany();

    const buffer = await renderInvoicePdf({
      docType: 'DEBIT NOTE',
      invoiceNumber: dn.debit_note_number,
      invoiceDate: fmtDate(dn.created_at),
      originalInvoiceNumber: dn.orig_purchase_number || undefined,
      company: {
        name: co.name, gstin: co.gstin, address: co.address,
        state: co.state, phone: co.phone, email: co.email, logoAbsPath: co.logoAbsPath,
      },
      customer: {
        name: dn.supplier_name ?? 'Supplier',
        address: dn.supplier_address ?? '',
        gstin: dn.supplier_gstin,
        phone: dn.supplier_phone || undefined,
      },
      items: lineRes.rows.map((l) => ({
        description: l.item_name, hsn: l.hsn_code ?? '',
        qty: Number(l.quantity), unit: l.unit, rate: Number(l.rate),
        discountAmount: 0, gstRate: Number(l.gst_rate),
        taxableValue: Number(l.taxable_value), cgst: Number(l.cgst_amount),
        sgst: Number(l.sgst_amount), total: Number(l.total_amount),
      })),
      invoiceDiscountAmount: 0,
      subtotal: Number(dn.subtotal),
      totalCgst: Number(dn.total_cgst),
      totalSgst: Number(dn.total_sgst),
      grandTotal: Number(dn.grand_total),
    });

    const safe = dn.debit_note_number.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/debit_note_${safe}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateDebitNotePdf failed:', err);
    return null;
  }
}

// ─── Tailoring Order PDFs ─────────────────────────────────────────────────────

async function getTailoringOrderData(orderId: string) {
  const [orderRes, measRes] = await Promise.all([
    query<{
      id: string; order_number: string; group_number: string | null; suffix: string | null;
      price: string; gst_rate: string | null; due_date: string | null;
      notes: string | null; color_fabric: string | null; created_at: string;
      customer_name: string; customer_phone: string | null;
      design_name: string; design_category: string | null; design_photo: string | null;
    }>(
      // total_amount (not price) is the up-to-date figure — edits/alterations only update total_amount.
      `SELECT o.id, o.order_number, o.group_number, o.suffix,
              o.total_amount::text AS price, o.gst_rate::text, o.due_date::text, o.notes, o.color_fabric, o.created_at::text,
              c.name AS customer_name, c.phone AS customer_phone,
              d.name AS design_name, d.category AS design_category, d.photo_path AS design_photo
       FROM tailoring_orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN designs   d ON d.id = o.design_id
       WHERE o.id = $1`,
      [orderId]
    ),
    query<{ field_name: string; value: string; unit: string | null }>(
      `SELECT f.field_name, mv.value, f.unit
       FROM tailoring_orders o
       JOIN measurement_versions v  ON v.id = o.measurement_version_id
       JOIN measurement_values  mv ON mv.version_id = v.id
       JOIN design_measurement_fields f ON f.id = mv.field_id
       WHERE o.id = $1
       ORDER BY f.sort_order, f.field_name`,
      [orderId]
    ),
  ]);
  return { order: orderRes.rows[0] ?? null, measurements: measRes.rows };
}

/**
 * Customer copy: grouped PDF — all orders sharing the same group_number on ONE page,
 * listed as line items with a single combined total at the bottom.
 * Falls back to a single-page PDF for orders without group_number.
 */
export async function generateTailoringCustomerPdf(orderId: string): Promise<string | null> {
  try {
    const { order: firstOrder } = await getTailoringOrderData(orderId);
    if (!firstOrder) return null;
    const co = await getCompany();

    // Collect all orders in the same group (sorted by suffix A, B, C...)
    let orderIds: string[] = [orderId];
    if (firstOrder.group_number) {
      const groupRes = await query<{ id: string }>(
        `SELECT id FROM tailoring_orders WHERE group_number=$1 ORDER BY suffix ASC, created_at ASC`,
        [firstOrder.group_number]
      );
      if (groupRes.rows.length > 0) orderIds = groupRes.rows.map((r) => r.id);
    }

    // Fetch data for all sibling orders
    const allData = await Promise.all(orderIds.map((id) => getTailoringOrderData(id)));
    const validData = allData.filter((d) => d.order !== null) as Array<{ order: NonNullable<Awaited<ReturnType<typeof getTailoringOrderData>>['order']>; measurements: Awaited<ReturnType<typeof getTailoringOrderData>>['measurements'] }>;
    if (!validData.length) return null;

    const companyInfo = { name: co.name, gstin: co.gstin, address: co.address, phone: co.phone, logoAbsPath: co.logoAbsPath };
    const groupNumber = firstOrder.group_number ?? firstOrder.order_number;
    const safe = groupNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/tailoring_customer_${safe}.pdf`;

    let buffer: Buffer;

    const resolvePhoto = (rawPath: string | null): string | undefined => {
      if (!rawPath) return undefined;
      const abs = path.join(process.cwd(), 'public', rawPath);
      return fs.existsSync(abs) ? abs : undefined;
    };

    if (validData.length === 1) {
      // Solo order — single-page layout
      const { order, measurements } = validData[0];
      buffer = await renderTailoringPdf({
        docType:     'TAILORING ORDER',
        orderNumber: groupNumber,
        orderDate:   fmtDate(order.created_at),
        dueDate:     order.due_date ? fmtDate(order.due_date) : undefined,
        company:     companyInfo,
        customer:    { name: order.customer_name, phone: order.customer_phone ?? undefined },
        items: [{
          designName:   order.design_name,
          colorFabric:  order.color_fabric ?? undefined,
          photoAbsPath: resolvePhoto(order.design_photo),
          qty:          1,
          price:        Number(order.price),
          notes:        order.notes ?? undefined,
          measurements: measurements.map((m) => ({ fieldName: m.field_name, value: m.value, unit: m.unit })),
        }],
        gstRate: order.gst_rate ? Number(order.gst_rate) : undefined,
        customTerms: co.termsAndConditions.length > 0 ? co.termsAndConditions : undefined,
      });
    } else {
      // Grouped booking — ONE page with items table and combined total
      const pdfItems: TailoringLineItem[] = [];
      for (const { order, measurements } of validData) {
        // Guard: if design_name is the company name (data bug), use category instead
        const designName = (order.design_name && order.design_name.toLowerCase() !== co.name.toLowerCase())
          ? order.design_name
          : (order.design_category ?? order.design_name);
        pdfItems.push({
          designName,
          colorFabric:  order.color_fabric ?? undefined,
          photoAbsPath: resolvePhoto(order.design_photo),
          qty:          1,
          price:        Number(order.price),
          notes:        order.notes ?? undefined,
          measurements: measurements.map((m) => ({ fieldName: m.field_name, value: m.value, unit: m.unit })),
        });
      }
      const firstValid = validData[0].order;
      buffer = await renderGroupedTailoringPdf({
        docType:     'TAILORING ORDER',
        orderNumber: groupNumber,
        orderDate:   fmtDate(firstValid.created_at),
        dueDate:     firstValid.due_date ? fmtDate(firstValid.due_date) : undefined,
        company:     companyInfo,
        customer:    { name: firstValid.customer_name, phone: firstValid.customer_phone ?? undefined },
        items:       pdfItems,
        gstRate:     firstValid.gst_rate ? Number(firstValid.gst_rate) : undefined,
        customTerms: co.termsAndConditions.length > 0 ? co.termsAndConditions : undefined,
      });
    }

    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateTailoringCustomerPdf failed:', err);
    return null;
  }
}

/** Tailor copy: NO customer name/phone/price — header shows full order_number e.g. "TO/2026-27/0029-A". */
export async function generateTailoringTailorPdf(orderId: string): Promise<string | null> {
  try {
    const { order, measurements } = await getTailoringOrderData(orderId);
    if (!order) return null;
    const co = await getCompany();

    // order_number already contains suffix (e.g. "TO/2026-27/0029-A")
    const displayNum = order.order_number;

    const buffer = await renderTailoringPdf({
      docType:     'PRODUCTION ORDER',
      orderNumber: displayNum,
      orderDate:   fmtDate(order.created_at),
      dueDate:     order.due_date ? fmtDate(order.due_date) : undefined,
      company:     { name: co.name, gstin: co.gstin, address: co.address, phone: co.phone, logoAbsPath: co.logoAbsPath },
      customer:    { name: order.customer_name, phone: order.customer_phone ?? undefined },
      items: [{
        designName:   order.design_name,
        colorFabric:  order.color_fabric ?? undefined,
        photoAbsPath: (() => {
          if (!order.design_photo) return undefined;
          const abs = path.join(process.cwd(), 'public', order.design_photo);
          return fs.existsSync(abs) ? abs : undefined;
        })(),
        qty:          1,
        price:        Number(order.price),
        notes:        order.notes ?? undefined,
        measurements: measurements.map((m) => ({ fieldName: m.field_name, value: m.value, unit: m.unit })),
      }],
    });

    const safe = order.order_number.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/tailoring_tailor_${safe}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateTailoringTailorPdf failed:', err);
    return null;
  }
}

/**
 * Kept for backward compatibility — delegates to generateTailoringCustomerPdf on the first order.
 * generateTailoringCustomerPdf now auto-collects all group siblings, so this is equivalent.
 */
export async function generateBatchTailoringPdf(batchId: string): Promise<string | null> {
  try {
    const res = await query<{ id: string }>(
      `SELECT id FROM tailoring_orders WHERE batch_id=$1 ORDER BY created_at ASC LIMIT 1`,
      [batchId]
    );
    if (!res.rows[0]) return null;
    return generateTailoringCustomerPdf(res.rows[0].id);
  } catch (err) {
    console.error('[pdf-generator] generateBatchTailoringPdf failed:', err);
    return null;
  }
}
