/**
 * Daily payment-reminder engine.
 * Called by the cron job (/api/cron/reminders) and the Settings "Run Now" button.
 *
 * Rule: once per day, send sutra_payment_reminder to every unpaid credit invoice
 * that has a customer phone. No interval logic, no pre-due/overdue distinction.
 */

import { pool } from '@/lib/db';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { generateInvoicePdf } from '@/lib/pdf-generator';

interface DueRow {
  invoice_id: string;
  invoice_number: string;
  grand_total: number;
  amount_paid: number;
  customer_id: string;
  customer_name: string;
  phone: string;
}

export interface ReminderRunResult {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function runDailyReminders(): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { checked: 0, sent: 0, skipped: 0, failed: 0, errors: [] };

  const client = await pool.connect();
  try {
    // All unpaid invoices not yet reminded today, with a customer phone
    const dueRes = await client.query<DueRow>(
      `SELECT
         i.id AS invoice_id, i.invoice_number, i.grand_total, i.amount_paid,
         c.id AS customer_id, c.name AS customer_name, c.phone
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.status IN ('issued','partially_paid')
         AND i.grand_total > i.amount_paid
         AND c.phone IS NOT NULL
         AND c.whatsapp_opt_out = FALSE
         AND (i.last_reminder_sent IS NULL OR i.last_reminder_sent < CURRENT_DATE)`
    );

    result.checked = dueRes.rows.length;

    for (const row of dueRes.rows) {
      const balance = Number(row.grand_total) - Number(row.amount_paid);
      // Generate invoice PDF to attach (best-effort — send even if generation fails)
      const pdfPath = await generateInvoicePdf(row.invoice_id).catch(() => null);
      // {{1}}=name {{2}}=amount due {{3}}=invoice number
      const waResult = await sendWhatsAppTemplate(row.phone, 'sutra_payment_reminder', [
        row.customer_name ?? 'Customer',
        `Rs.${balance.toFixed(2)}`,
        row.invoice_number,
      ], pdfPath);

      if (waResult.success) {
        await client.query(
          `UPDATE invoices SET last_reminder_sent = CURRENT_DATE WHERE id = $1`,
          [row.invoice_id]
        );
      }

      await client.query(
        `INSERT INTO reminder_logs
           (customer_id, invoice_id, setting_id, phone_number, message_sent, whatsapp_message_id, status, error_message)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7)`,
        [
          row.customer_id, row.invoice_id, row.phone,
          `Payment reminder: ${row.invoice_number} — Rs.${balance.toFixed(2)}`,
          waResult.messageId ?? null,
          waResult.success ? 'sent' : 'failed',
          waResult.error ?? null,
        ]
      ).catch(() => {});

      if (waResult.success) result.sent++;
      else { result.failed++; result.errors.push(`${row.invoice_number}: ${waResult.error}`); }
    }
  } finally {
    client.release();
  }

  return result;
}
