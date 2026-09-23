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
import { renderThermalPdf, renderMeasurementThermalPdf } from '@/lib/pdf/thermal-template';
import { renderTailoringPdf } from '@/lib/pdf/tailoring-template';

const fmtDate = (d: string | Date | null): string =>
  d ? new Date(d).toLocaleDateString('en-IN') : '';

const splitTerms = (raw: string): string[] =>
  raw.split('\n').map((line) => line.trim()).filter(Boolean);

async function getCompany(): Promise<PdfCompany & { upiVpa: string; retailTerms: string[]; tailoringTerms: string[] }> {
  const { rows } = await query<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const rawLogo = s.company_logo_path ?? '';
  const logoAbsPath = rawLogo
    ? (() => {
        const p = path.join(process.cwd(), 'public', rawLogo);
        return fs.existsSync(p) ? p : undefined;
      })()
    : undefined;

  // Retail and tailoring documents each print their own Terms & Conditions
  // (see Settings > Store). Falls back to the legacy single
  // 'terms_and_conditions' key if a split key hasn't been set yet.
  const retailTerms = splitTerms(s.retail_terms_and_conditions ?? s.terms_and_conditions ?? '');
  const tailoringTerms = splitTerms(s.tailoring_terms_and_conditions ?? s.terms_and_conditions ?? '');

  return {
    name: s.company_name ?? 'Sutra Collections',
    gstin: s.company_gstin ?? '',
    address: s.company_address ?? '',
    state: s.company_state ?? 'Karnataka',
    phone: s.company_phone || undefined,
    email: s.company_email || undefined,
    logoAbsPath,
    upiVpa: s.upi_vpa ?? '',
    retailTerms,
    tailoringTerms,
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
    const invoiceTerms = inv.source === 'tailoring' ? co.tailoringTerms : co.retailTerms;

    let upiQrDataUrl: string | undefined;
    const balance = Math.max(0, Number(inv.grand_total) - Number(inv.amount_paid));
    if (co.upiVpa) {
      const amount = balance > 0 ? balance : Number(inv.grand_total);
      const uri = `upi://pay?pa=${encodeURIComponent(co.upiVpa)}&am=${amount.toFixed(2)}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`;
      upiQrDataUrl = await QRCode.toDataURL(uri, { width: 128, margin: 1 });
    } else {
      console.warn('[pdf-generator] UPI VPA not configured — skipping QR for invoice', inv.invoice_number);
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
      customTerms: invoiceTerms.length > 0 ? invoiceTerms : undefined,
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

// ─── Shared: grouped tailoring order data (customer invoice + order-confirmation) ─
// Both generateTailoringProformaPdf and generateTailoringOrderConfirmationPdf
// source from tailoring_orders (never invoices/invoice_items — the real GST
// invoice lives separately, see lib/tailoring-invoice.ts) and never post to
// accounting.
//
// Group-aware: if the order was booked together with others under the same
// group_number (a multi-item booking session), ALL sibling orders are combined
// into ONE document with a per-item breakdown and a single combined total —
// same convention as generateTailoringCustomerPdf. This matters because the
// wizard suppresses the per-order WhatsApp send for every item in a batch and
// fires this once for the whole group instead (see sendBatchConfirmationAction
// in app/(auth)/tailoring/actions.ts) — a single-item document would only have
// shown one of several booked items with an incomplete total.
async function fetchGroupedTailoringData(orderId: string) {
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
    alteration_total: string; quantity: number;
  }>(
    `SELECT o.total_amount::text, o.amount_paid::text, o.gst_rate::text, o.created_at::text,
            o.notes, o.order_number, o.suffix, o.quantity, d.name AS design_name,
            COALESCE((SELECT SUM(price_adjustment) FROM tailoring_alterations WHERE tailoring_order_id=o.id), 0)::text AS alteration_total
     FROM tailoring_orders o JOIN designs d ON d.id = o.design_id
     WHERE o.id = ANY($1::uuid[])
     ORDER BY o.suffix ASC, o.created_at ASC`,
    [siblingIds]
  );
  if (!siblings.length) return null;

  // Each sibling becomes one line for the garment's base price, plus a
  // separate "Alteration Charges" line when it has a non-zero net alteration
  // adjustment — so the cost of alterations is visible on the PDF instead of
  // being silently folded into the garment's price. The garment line splits
  // its base total back into qty × unit rate (total_amount is the up-to-date
  // figure, so the unit rate is derived from it rather than read from the
  // possibly-stale `price` column — see updateOrderAction/alterations, which
  // only ever mutate total_amount) so the PDF shows the real quantity instead
  // of always "1 pcs" at the full line total.
  const lineEntries = siblings.flatMap((s) => {
    const gstRate = Number(s.gst_rate);
    const quantity = Number(s.quantity) > 0 ? Number(s.quantity) : 1;
    const alterationTotal = Math.round(Number(s.alteration_total) * 100) / 100;
    const basePrice = Math.round((Number(s.total_amount) - alterationTotal) * 100) / 100;
    const unitRate = Math.round((basePrice / quantity) * 100) / 100;
    const entries = [{
      description: s.design_name, rate: unitRate, qty: quantity, gstRate,
      result: calcLine({ quantity, rate: unitRate, gstRate, isScheme: false }),
    }];
    if (Math.abs(alterationTotal) >= 0.005) {
      entries.push({
        description: `Alteration Charges — ${s.design_name}`, rate: alterationTotal, qty: 1, gstRate,
        result: calcLine({ quantity: 1, rate: alterationTotal, gstRate, isScheme: false }),
      });
    }
    return entries;
  });
  const lineResults = lineEntries.map((e) => e.result);
  const totals = calcInvoiceTotals(lineResults);
  const amountPaid = siblings.reduce((sum, s) => sum + Number(s.amount_paid), 0);
  const displayRef = anchor.group_number ?? anchor.order_number;

  // Real order notes/special-instructions — never an auto-generated
  // "Reference: <order_number>"-style placeholder. Omitted entirely if no
  // sibling has one filled in. Multi-item bookings prefix each note with
  // its design name so staff/customer can tell which item it applies to.
  const notesEntries = siblings
    .filter((s) => s.notes?.trim())
    .map((s) => (siblings.length > 1 ? `${s.design_name}: ${s.notes!.trim()}` : s.notes!.trim()));
  const combinedNotes = notesEntries.length > 0 ? notesEntries.join('\n') : undefined;

  return { anchor, siblings, lineEntries, lineResults, totals, amountPaid, displayRef, combinedNotes };
}

// ─── Tailoring Order Confirmation (order creation AND ready-for-pickup) ───────
// This is the ONE customer-facing tailoring document used at both trigger
// points (see app/(auth)/tailoring/actions.ts) — at creation it shows
// whatever advance was paid at that point (could be ₹0), and at
// ready-for-pickup it's regenerated with the current total (including any
// alteration charges as a separate line item) and current amount paid.
// Shows Advance Paid/Balance Due (docType 'ORDER_CONFIRMATION' is gated into
// the same rendering block as the legacy 'PROFORMA' docType in
// invoice-template.tsx). Not the accounting GST invoice — that's a separate
// internal record created at ready_for_pickup (see lib/tailoring-invoice.ts),
// only ever sent to the customer once the order becomes fully paid, via
// generateInvoicePdf() reading the actual invoices/invoice_items rows.
export async function generateTailoringOrderConfirmationPdf(orderId: string): Promise<string | null> {
  try {
    const data = await fetchGroupedTailoringData(orderId);
    if (!data) return null;
    const { anchor, siblings, lineEntries, lineResults, totals, amountPaid, displayRef, combinedNotes } = data;
    const co = await getCompany();

    const buffer = await renderInvoicePdf({
      docType: 'ORDER_CONFIRMATION',
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
      items: lineEntries.map((e, i) => ({
        description: e.description, hsn: '9988', qty: e.qty, unit: 'pcs',
        rate: e.rate, discountAmount: 0, gstRate: e.gstRate,
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
      customTerms: co.tailoringTerms.length > 0 ? co.tailoringTerms : undefined,
    });

    const safe = `${displayRef}_confirmation`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/order_confirmation_${safe}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateTailoringOrderConfirmationPdf failed:', err);
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
      customTerms: co.tailoringTerms.length > 0 ? co.tailoringTerms : undefined,
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
    const invoiceTerms = inv.source === 'tailoring' ? co.tailoringTerms : co.retailTerms;

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
      customTerms: invoiceTerms.length > 0 ? invoiceTerms : undefined,
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
      price: string; quantity: number; gst_rate: string | null; due_date: string | null;
      notes: string | null; notes_tailor: string | null; color_fabric: string | null; created_at: string;
      customer_name: string; customer_phone: string | null;
      design_name: string; design_category: string | null; design_photo: string | null;
    }>(
      // total_amount (not price) is the up-to-date figure — edits/alterations only update total_amount.
      `SELECT o.id, o.order_number, o.group_number, o.suffix,
              o.total_amount::text AS price, o.quantity, o.gst_rate::text, o.due_date::text,
              o.notes, o.notes_tailor, o.color_fabric, o.created_at::text,
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
 * Customer copy — same visual template as regular invoices/order confirmation
 * (lib/pdf/invoice-template.tsx), grouped across all sibling orders sharing the
 * same group_number into one document with a combined total, just like
 * generateTailoringOrderConfirmationPdf (which this mirrors so the on-demand
 * "Customer PDF" button always matches what was already sent to the customer).
 */
export async function generateTailoringCustomerPdf(orderId: string): Promise<string | null> {
  try {
    const data = await fetchGroupedTailoringData(orderId);
    if (!data) return null;
    const { anchor, siblings, lineEntries, lineResults, totals, amountPaid, displayRef, combinedNotes } = data;
    const co = await getCompany();

    const buffer = await renderInvoicePdf({
      docType: 'ORDER_CONFIRMATION',
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
      items: lineEntries.map((e, i) => ({
        description: e.description, hsn: '9988', qty: e.qty, unit: 'pcs',
        rate: e.rate, discountAmount: 0, gstRate: e.gstRate,
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
      customTerms: co.tailoringTerms.length > 0 ? co.tailoringTerms : undefined,
    });

    const safe = `${displayRef}_customer`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/tailoring_customer_${safe}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateTailoringCustomerPdf failed:', err);
    return null;
  }
}

/**
 * Tailor copy — same visual template as regular invoices, but with pricing,
 * GST and customer contact info all hidden (hidePricing/hideCustomerBlock):
 * only the order reference, design/measurements, and tailor-only notes. Never
 * shows the customer-facing `notes` field — only `notes_tailor`.
 */
export async function generateTailoringTailorPdf(orderId: string): Promise<string | null> {
  try {
    const { order, measurements } = await getTailoringOrderData(orderId);
    if (!order) return null;
    const co = await getCompany();

    const photoAbsPath = (() => {
      if (!order.design_photo) return undefined;
      const abs = path.join(process.cwd(), 'public', order.design_photo);
      return fs.existsSync(abs) ? abs : undefined;
    })();

    const buffer = await renderInvoicePdf({
      docType: 'PRODUCTION_ORDER',
      invoiceNumber: order.order_number,
      invoiceDate: fmtDate(order.created_at),
      dueDate: order.due_date ? fmtDate(order.due_date) : undefined,
      company: { name: co.name, gstin: co.gstin, address: co.address, state: co.state, phone: co.phone, logoAbsPath: co.logoAbsPath },
      customer: { name: '', address: '' },
      items: [],
      invoiceDiscountAmount: 0, subtotal: 0, totalCgst: 0, totalSgst: 0, grandTotal: 0,
      hidePricing: true,
      hideCustomerBlock: true,
      internalDocLabel: 'Internal production document — confidential.',
      measurementGroups: [{
        designName:   order.design_name,
        colorFabric:  order.color_fabric ?? undefined,
        photoAbsPath,
        qty:          Number(order.quantity) || 1,
        notes:        order.notes_tailor ?? undefined,
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
 * Tailor-facing ALTERATION document. Contains NO customer name/phone and NO
 * pricing/GST — only the alteration reference, the reason (description), and the
 * "changed to" measurements captured with the alteration. Meant to be sent to
 * the assigned tailor so they know exactly what to rework.
 */
export async function generateAlterationTailorPdf(alterationId: string): Promise<string | null> {
  try {
    const { rows } = await query<{
      description: string; requested_at: string; measurement_version_id: string | null;
      order_number: string; group_number: string | null; suffix: string | null; due_date: string | null;
      color_fabric: string | null;
      design_name: string; design_category: string | null; design_photo: string | null;
      seq: string;
    }>(
      `SELECT a.description, a.requested_at::text, a.measurement_version_id,
              o.order_number, o.group_number, o.suffix, o.due_date::text, o.color_fabric,
              d.name AS design_name, d.category AS design_category, d.photo_path AS design_photo,
              (SELECT COUNT(*) FROM tailoring_alterations a2
               WHERE a2.tailoring_order_id = a.tailoring_order_id
                 AND a2.requested_at <= a.requested_at)::text AS seq
       FROM tailoring_alterations a
       JOIN tailoring_orders o ON o.id = a.tailoring_order_id
       JOIN designs d ON d.id = o.design_id
       WHERE a.id = $1`,
      [alterationId]
    );
    const alt = rows[0];
    if (!alt) return null;
    const co = await getCompany();

    const measRes = alt.measurement_version_id
      ? await query<{ field_name: string; value: string; unit: string | null }>(
          `SELECT f.field_name, mv.value, f.unit
           FROM measurement_values mv
           JOIN design_measurement_fields f ON f.id = mv.field_id
           WHERE mv.version_id = $1
           ORDER BY f.sort_order, f.field_name`,
          [alt.measurement_version_id]
        )
      : { rows: [] as Array<{ field_name: string; value: string; unit: string | null }> };

    const photoAbsPath = (() => {
      if (!alt.design_photo) return undefined;
      const abs = path.join(process.cwd(), 'public', alt.design_photo);
      return fs.existsSync(abs) ? abs : undefined;
    })();

    const altRef = `${alt.order_number} · ALT-${alt.seq}`;

    const buffer = await renderTailoringPdf({
      docType:     'ALTERATION',
      orderNumber: altRef,
      orderDate:   fmtDate(alt.requested_at),
      dueDate:     alt.due_date ? fmtDate(alt.due_date) : undefined,
      company:     { name: co.name, gstin: co.gstin, address: co.address, phone: co.phone, logoAbsPath: co.logoAbsPath },
      // Tailor document — customer block is not rendered for non-'TAILORING ORDER' docTypes.
      customer:    { name: '' },
      items: [{
        designName:   alt.design_name,
        colorFabric:  alt.color_fabric ?? undefined,
        photoAbsPath,
        qty:          1,
        price:        0, // not rendered on tailor docs
        notes:        `Reason for alteration: ${alt.description}`,
        measurements: measRes.rows.map((m) => ({ fieldName: m.field_name, value: m.value, unit: m.unit })),
      }],
    });

    const safe = altRef.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `/tmp/alteration_${safe}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateAlterationTailorPdf failed:', err);
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

// ─── Measurement Version — thermal receipt ───────────────────────────────────

export async function generateMeasurementThermalPdf(versionId: string): Promise<string | null> {
  try {
    const [verRes, valRes] = await Promise.all([
      query<{
        version_number: number; created_at: string; taken_by_name: string | null;
        design_name: string; customer_name: string;
      }>(
        `SELECT mv.version_number, mv.created_at::text, u.name AS taken_by_name,
                d.name AS design_name, c.name AS customer_name
         FROM measurement_versions mv
         JOIN designs d   ON d.id = mv.design_id
         JOIN customers c ON c.id = mv.customer_id
         LEFT JOIN users u ON u.id = mv.taken_by
         WHERE mv.id = $1`,
        [versionId]
      ),
      query<{ field_name: string; value: string; unit: string | null }>(
        `SELECT f.field_name, v.value, f.unit
         FROM measurement_values v
         JOIN design_measurement_fields f ON f.id = v.field_id
         WHERE v.version_id = $1
         ORDER BY f.sort_order, f.field_name`,
        [versionId]
      ),
    ]);

    const ver = verRes.rows[0];
    if (!ver) return null;
    const co = await getCompany();

    const logoDataUrl = co.logoAbsPath
      ? `data:image/${path.extname(co.logoAbsPath).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(co.logoAbsPath).toString('base64')}`
      : undefined;

    const buffer = await renderMeasurementThermalPdf({
      companyName: co.name,
      logoDataUrl,
      designName: ver.design_name,
      customerName: ver.customer_name,
      versionNumber: ver.version_number,
      createdAt: fmtDate(ver.created_at),
      takenByName: ver.taken_by_name,
      measurements: valRes.rows.map((r) => ({ fieldName: r.field_name, value: r.value, unit: r.unit })),
    });

    const filePath = `/tmp/measurement_v${ver.version_number}_${versionId}.pdf`;
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('[pdf-generator] generateMeasurementThermalPdf failed:', err);
    return null;
  }
}
