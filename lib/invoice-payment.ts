import type { PoolClient } from 'pg';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { postPaymentReceived } from '@/lib/accounting';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { getLoyaltyRates, earnPoints } from '@/lib/loyalty';
import { logAudit } from '@/lib/audit';
import { generateThermalInvoicePdf } from '@/lib/pdf-generator';
import { logAppError } from '@/lib/app-error-log';
import { todayIST } from '@/lib/ist-date';
import { sendFullyPaidNotification } from '@/app/(auth)/tailoring/actions';

// Shared invoice-payment pipeline, moved out of app/(auth)/billing/invoices/actions.ts
// (a 'use server' module, where any export becomes a client-callable action) so
// both Billing (Collect / Outstanding Dues) and the SHRX console's silent
// due-clear use the exact same logic. Not a server action — call it only from
// code that has already authorised the caller.

// Mirrors syncPaymentToInvoices (app/(auth)/tailoring/actions.ts) in the
// opposite direction: when a payment is recorded directly against an
// invoice (e.g. from the Outstanding Dues page) and that invoice is linked
// to a tailoring order — either as the order's root invoice
// (tailoring_orders.invoice_id) or a supplementary invoice created for a
// post-lock alteration (invoices.supplementary_of_invoice_id) — the
// tailoring order's amount_paid must reflect it too, or the Production
// Board keeps showing a stale balance/"Payment Due" after the invoice side
// already shows paid. Recomputes amount_paid as the SUM across the root +
// all its supplementary invoices (self-correcting regardless of which side
// the payment came in from) rather than trying to apply just this payment's
// delta, which could double- or under-count. Also pays down any outstanding
// credit_amount by the delta actually applied here, matching the paydown
// logic recordTailoringPaymentAction already does for the reverse direction.
// Best-effort: never throws — a sync failure must not roll back the payment.
// Also reports whether this sync just crossed the order from balance>0 to
// balance=0, so the caller can fire sendFullyPaidNotification exactly once
// on the actual transition (not on a payment that merely keeps an
// already-fully-paid order at 0).
async function syncInvoicePaymentToTailoringOrder(
  invoiceId: string,
  deltaApplied: number,
  client: PoolClient
): Promise<{ orderId: string; justBecameFullyPaid: boolean } | null> {
  try {
    const rootRes = await client.query<{ root_id: string }>(
      `SELECT COALESCE(supplementary_of_invoice_id, id) AS root_id FROM invoices WHERE id=$1`,
      [invoiceId]
    );
    const rootId = rootRes.rows[0]?.root_id;
    if (!rootId) return null;

    const orderRes = await client.query<{ id: string; total_amount: string; amount_paid: string }>(
      `SELECT id, total_amount::text, amount_paid::text FROM tailoring_orders WHERE invoice_id=$1`, [rootId]
    );
    const order = orderRes.rows[0];
    if (!order) return null;

    const totalRes = await client.query<{ total_paid: string }>(
      `SELECT COALESCE(SUM(amount_paid), 0)::text AS total_paid
       FROM invoices WHERE id=$1 OR supplementary_of_invoice_id=$1`,
      [rootId]
    );
    const totalPaid = Number(totalRes.rows[0]?.total_paid ?? 0);

    const balanceBefore = Math.round((Number(order.total_amount) - Number(order.amount_paid)) * 100) / 100;
    const balanceAfter = Math.round((Number(order.total_amount) - totalPaid) * 100) / 100;
    const justBecameFullyPaid = balanceBefore > 0.005 && balanceAfter <= 0.005;

    await client.query(
      `UPDATE tailoring_orders
       SET amount_paid=$1, credit_amount=GREATEST(0, credit_amount - $2), updated_at=NOW()
       WHERE id=$3`,
      [totalPaid, deltaApplied, order.id]
    );
    return { orderId: order.id, justBecameFullyPaid };
  } catch (err) {
    console.error('[syncInvoicePaymentToTailoringOrder] failed:', err);
    logAppError('payment.sync.invoice_to_tailoring_order', err, { type: 'invoice', id: invoiceId }, { deltaApplied });
    return null;
  }
}

// ─── Record Payment ───────────────────────────────────────────────────────────

// Core payment-application logic shared by recordPaymentAction (the normal,
// customer-notifying "Collect Payment" flow) and clearCustomerDuesAction (the
// silent internal correction from Outstanding Dues — see opts.skipNotify).
// Returns the WhatsApp send outcome so recordPaymentAction can still build its
// redirect query string; clearCustomerDuesAction ignores it.
export async function applyInvoicePayment(
  id: string,
  amount: number,
  mode: string,
  session: { userId: string },
  opts?: { skipNotify?: boolean }
): Promise<{ waResult: 'sent' | 'failed' | 'skip'; waError: string; invoiceNumber: string }> {
  const invRes = await query<{
    grand_total: string; amount_paid: string; invoice_number: string;
    customer_id: string | null; customer_phone: string | null; customer_name: string | null;
    loyalty_points_redeemed: string; source: string;
  }>(
    `SELECT i.grand_total, i.amount_paid, i.invoice_number, i.customer_id,
            i.loyalty_points_redeemed, i.source,
            c.phone AS customer_phone, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.id=$1`,
    [id]
  );
  if (!invRes.rows[0]) return { waResult: 'skip', waError: '', invoiceNumber: '' };

  const grandTotal = Number(invRes.rows[0].grand_total);
  const newPaid = Number(invRes.rows[0].amount_paid) + amount;
  const capped = Math.min(newPaid, grandTotal);
  const newStatus = capped >= grandTotal ? 'paid' : 'partially_paid';

  const client = await (await import('@/lib/db')).pool.connect();
  let tailoringSync: { orderId: string; justBecameFullyPaid: boolean } | null = null;
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE invoices SET amount_paid=$1, payment_mode=$2, status=$3 WHERE id=$4`,
      [capped, mode, newStatus, id]
    );
    const deltaApplied = capped - Number(invRes.rows[0].amount_paid);
    // Tailoring invoices are outside accounting — update the invoice and the
    // linked order, but post nothing to the ledger.
    if (invRes.rows[0].source !== 'tailoring') {
      try {
        await postPaymentReceived({
          invoiceId: id,
          invoiceNumber: invRes.rows[0].invoice_number,
          paymentDate: todayIST(),
          amount: deltaApplied,
          paymentMode: mode,
          createdBy: session.userId,
        }, client);
      } catch (acctErr) {
        console.error('Accounting post failed:', acctErr);
        logAppError('payment.journal', acctErr, { type: 'invoice', id }, { amount: deltaApplied, mode });
      }
    }
    tailoringSync = await syncInvoicePaymentToTailoringOrder(id, deltaApplied, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  logAudit({ userId: session.userId, action: 'payment', entityType: 'invoice', entityId: id, entityLabel: invRes.rows[0].invoice_number, newValue: { amount, mode, newStatus } }).catch(() => {});

  // Keep the Production Board (and the order's own detail page) in sync —
  // without this, a payment recorded here left both showing the stale
  // pre-payment balance until some unrelated action forced a refetch.
  // sendFullyPaidNotification (below) sends its own "sutra_payment_received"
  // WhatsApp with the A4 GST invoice attached — the canonical single message
  // for a tailoring order crossing into fully-paid. When it fires, the
  // generic thermal-receipt send further down MUST be skipped for this same
  // payment event, or the customer gets two "payment received" messages
  // back-to-back (one A4, one thermal) for the same payment.
  let firedFullyPaidNotification = false;

  if (tailoringSync) {
    revalidatePath('/tailoring/production');
    revalidatePath('/tailoring');
    revalidatePath(`/tailoring/${tailoringSync.orderId}`);
    // Silent internal correction (clearCustomerDuesAction): this order becoming
    // fully paid here is not a real customer payment event, so never fire the
    // customer-facing "payment received" WhatsApp for it either.
    if (tailoringSync.justBecameFullyPaid && !opts?.skipNotify) {
      firedFullyPaidNotification = true;
      sendFullyPaidNotification(tailoringSync.orderId, amount).catch((e) => console.error('[recordPaymentAction] fully-paid WA failed:', e));
    }
  }

  // Earn loyalty points when credit invoice is fully paid
  // Earn on net amount: grand total minus any loyalty discount already applied
  if (newStatus === 'paid' && invRes.rows[0].customer_id) {
    const existing = await query(
      `SELECT 1 FROM loyalty_transactions WHERE reference_id=$1 AND type='earned' LIMIT 1`, [id]
    );
    if (existing.rows.length === 0) {
      const rates = await getLoyaltyRates();
      const loyaltyRedeemed = Number(invRes.rows[0].loyalty_points_redeemed ?? 0);
      const loyaltyDiscount = loyaltyRedeemed; // 1 pt = ₹1
      const earnBase = Math.max(0, grandTotal - loyaltyDiscount);
      await earnPoints(invRes.rows[0].customer_id, earnBase, id, rates.earnRate);
    }
  }

  let waResult: 'sent' | 'failed' | 'skip' = 'skip';
  let waError = '';

  // Silent internal correction (Outstanding Dues > clear due): never send the
  // customer-facing "payment received" WhatsApp/receipt for this — it isn't a
  // real payment event from the customer's point of view. Also skipped when
  // sendFullyPaidNotification already sent the canonical message above (a
  // tailoring order crossing into fully-paid) — never both for one payment.
  if (!opts?.skipNotify && !firedFullyPaidNotification) {
    // Generate receipt PDF then send sutra_payment_received
    // {{1}}=name, {{2}}=amount, {{3}}=invoice# (template body already reads "Rs.{{2}}" — send the bare number)
    const receiptPath = await generateThermalInvoicePdf(id).catch(() => null);

    const phone = invRes.rows[0]?.customer_phone;
    if (phone) {
      try {
        const waSent = await sendWhatsAppTemplate(
          phone,
          'sutra_payment_received',
          [
            invRes.rows[0].customer_name ?? 'Customer',
            amount.toFixed(2),
            invRes.rows[0].invoice_number,
          ],
          receiptPath
        );
        waResult = waSent.success ? 'sent' : 'failed';
        if (!waSent.success) {
          waError = waSent.error ?? 'unknown error';
        }
      } catch (err) {
        waResult = 'failed';
        waError = (err as Error).message ?? 'unknown error';
      }
    }
  }

  return { waResult, waError, invoiceNumber: invRes.rows[0].invoice_number };
}
