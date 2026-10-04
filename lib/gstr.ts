// Shared helpers for the GSTR-1 and GSTR-3B reports.
//
// Invoice and credit-note subtotal / grand_total are GST-INCLUSIVE: a line's
// total_amount is its gross price including GST (see lib/gst.ts calcLine), and
// the invoice header copies that sum. So "subtotal" is NOT the taxable value.
// Taxable value is what remains after the tax is removed from the invoice value.
// The returns must use taxableSql() everywhere; never SUM(subtotal) as taxable.

/**
 * SQL expression for taxable value of an invoice or credit note row.
 * grand_total already has the (prorated) invoice-level discount applied, and
 * total_cgst / total_sgst are prorated the same way, so this keeps
 * invoice value = taxable value + CGST + SGST exact.
 */
export function taxableSql(alias: string): string {
  return `(${alias}.grand_total - ${alias}.total_cgst - ${alias}.total_sgst)`;
}
