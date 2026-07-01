/**
 * GST calculation utilities.
 *
 * Default mode (tax-inclusive): the price entered by the user IS the final price.
 * Back-calculate taxable value = price / (1 + rate/100), then split CGST + SGST.
 *
 * Scheme mode (tax-exclusive): taxable value = price, GST is added on top.
 * Used only for Buy-X-Get-Y scheme invoices.
 */

export interface LineCalc {
  quantity: number;
  rate: number;            // entered price per unit (inclusive or exclusive depending on mode)
  discountType?: 'flat' | 'percent' | null;
  discountValue?: number;
  gstRate: number;         // e.g. 18 for 18%
  isScheme?: boolean;      // true → tax-exclusive
}

export interface LineResult {
  discountAmount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  totalAmount: number;
}

export function calcLine(line: LineCalc): LineResult {
  const gross = round2(line.quantity * line.rate);

  // Discount on gross amount
  let discountAmount = 0;
  if (line.discountType === 'flat') {
    discountAmount = round2(line.discountValue ?? 0);
  } else if (line.discountType === 'percent') {
    discountAmount = round2(gross * ((line.discountValue ?? 0) / 100));
  }
  const netAmount = round2(gross - discountAmount);

  const rate = line.gstRate;

  let taxableValue: number;
  let cgstAmount: number;
  let sgstAmount: number;
  let totalAmount: number;

  if (line.isScheme) {
    // Tax-exclusive: GST added on top
    taxableValue = netAmount;
    cgstAmount = round2(taxableValue * (rate / 2) / 100);
    sgstAmount = cgstAmount;
    totalAmount = round2(taxableValue + cgstAmount + sgstAmount);
  } else {
    // Tax-inclusive: back-calculate taxable value
    taxableValue = round2(netAmount / (1 + rate / 100));
    const totalGst = round2(netAmount - taxableValue);
    cgstAmount = round2(totalGst / 2);
    sgstAmount = round2(totalGst - cgstAmount); // handles rounding remainder
    totalAmount = netAmount; // price already includes tax
  }

  return { discountAmount, taxableValue, cgstAmount, sgstAmount, totalAmount };
}

export interface InvoiceTotals {
  subtotal: number;        // sum of line totalAmounts before invoice-level discount
  invoiceDiscountAmount: number;
  totalCgst: number;
  totalSgst: number;
  grandTotal: number;
}

export interface InvoiceDiscountInput {
  discountType?: 'flat' | 'percent' | null;
  discountValue?: number;
}

export function calcInvoiceTotals(
  lines: LineResult[],
  invoiceDiscount?: InvoiceDiscountInput
): InvoiceTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.totalAmount, 0));

  let invoiceDiscountAmount = 0;
  if (invoiceDiscount?.discountType === 'flat') {
    invoiceDiscountAmount = round2(invoiceDiscount.discountValue ?? 0);
  } else if (invoiceDiscount?.discountType === 'percent') {
    invoiceDiscountAmount = round2(subtotal * ((invoiceDiscount.discountValue ?? 0) / 100));
  }

  // Prorate invoice-level discount across lines to get adjusted GST
  const ratio = subtotal > 0 ? (subtotal - invoiceDiscountAmount) / subtotal : 1;
  const totalCgst = round2(lines.reduce((s, l) => s + l.cgstAmount, 0) * ratio);
  const totalSgst = round2(lines.reduce((s, l) => s + l.sgstAmount, 0) * ratio);

  const grandTotal = round2(subtotal - invoiceDiscountAmount);

  return { subtotal, invoiceDiscountAmount, totalCgst, totalSgst, grandTotal };
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
