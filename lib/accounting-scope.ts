/**
 * Accounting scope: what counts as "in the books".
 *
 * Business rule (Oct 2026): tailoring is billing/record-keeping only. It
 * carries zero tax and is OUTSIDE accounting. Accounting, GST returns and
 * financial totals cover retail only.
 *
 * "Tailoring" here means every invoice with source = 'tailoring' — the root
 * invoice created at ready-for-pickup AND supplementary (alteration) invoices,
 * which are also created with source = 'tailoring' — plus the payments
 * posted against them.
 *
 * Nothing is deleted or rewritten: new tailoring invoices/payments simply
 * stop posting journal entries (lib/tailoring-invoice.ts, tailoring
 * payment sync), and the reports below filter out the journal entries that
 * older tailoring invoices/payments already posted, using these predicates.
 * Data stays intact, so the filter is reversible.
 */

/** SQL predicate: invoice alias is retail (not tailoring). */
export const retailInvoice = (alias = 'i') => `${alias}.source <> 'tailoring'`;

/**
 * SQL predicate on a journal_entries alias: true unless the entry is a
 * tailoring sales posting (reference_type 'invoice') or a payment/store-credit
 * application against a tailoring invoice (reference_type 'payment'). Both
 * types use the invoice id as reference_id.
 */
export const notTailoringJournal = (je = 'je') =>
  `NOT (${je}.reference_type IN ('invoice','payment') AND ${je}.reference_id IN (SELECT id FROM invoices WHERE source = 'tailoring'))`;
