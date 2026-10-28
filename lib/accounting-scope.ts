/**
 * Accounting scope: what counts as "in the books".
 *
 * Business rule (Oct 2026): tailoring is billing/record-keeping only. It
 * carries zero tax and is OUTSIDE accounting. Accounting, GST returns and
 * financial totals cover retail only.
 *
 * "Tailoring" here means:
 *   - every invoice with source = 'tailoring' — the root invoice created at
 *     ready-for-pickup AND supplementary (alteration) invoices, which are
 *     also created with source = 'tailoring';
 *   - payments / store credit applied against those invoices;
 *   - credit notes (refunds) whose invoice_id is a tailoring invoice.
 *
 * DELIBERATE, NOT A BUG — do not "fix": this applies to ALL tailoring,
 * including OLD tailoring invoices from past months that were issued with
 * GST before the rule existed. There is intentionally NO cutoff date. The
 * owner decided GSTR-1, GSTR-3B and HSN exclude every tailoring invoice and
 * tailoring refund, past and future (decision recorded Oct 2026).
 *
 * Nothing is deleted or rewritten: new tailoring invoices/payments/refunds
 * simply stop posting journal entries, and the reports filter out the
 * entries older ones already posted, using these predicates. Data stays
 * intact, so the filter is reversible.
 */

/** SQL predicate: invoice alias is retail (not tailoring). */
export const retailInvoice = (alias = 'i') => `${alias}.source <> 'tailoring'`;

/** SQL predicate: credit-note alias is not a refund against a tailoring invoice. */
export const retailCreditNote = (cn = 'cn') =>
  `NOT EXISTS (SELECT 1 FROM invoices tinv WHERE tinv.id = ${cn}.invoice_id AND tinv.source = 'tailoring')`;

/**
 * SQL predicate on a journal_entries alias: true unless the entry is
 *   - a tailoring sales posting (reference_type 'invoice'),
 *   - a payment/store-credit application against a tailoring invoice
 *     (reference_type 'payment' — both use the invoice id as reference_id), or
 *   - a refund against a tailoring invoice (reference_type 'credit_note',
 *     reference_id = credit note id).
 */
export const notTailoringJournal = (je = 'je') =>
  `NOT (
    (${je}.reference_type IN ('invoice','payment') AND ${je}.reference_id IN (SELECT id FROM invoices WHERE source = 'tailoring'))
    OR (${je}.reference_type = 'credit_note' AND ${je}.reference_id IN (
      SELECT cnx.id FROM credit_notes cnx JOIN invoices ix ON ix.id = cnx.invoice_id WHERE ix.source = 'tailoring'))
  )`;
