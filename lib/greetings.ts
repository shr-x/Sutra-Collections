/**
 * Daily birthday & anniversary greeting job.
 * Called by /api/cron/greetings — matches customers whose birthday or
 * anniversary falls on today's month+day, sends a WhatsApp message,
 * and logs to avoid duplicate sends within the same calendar year.
 */

import { pool } from '@/lib/db';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';

export interface GreetingRunResult {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function runDailyGreetings(): Promise<GreetingRunResult> {
  const result: GreetingRunResult = { checked: 0, sent: 0, skipped: 0, failed: 0, errors: [] };

  const client = await pool.connect();
  try {
    // Today's month-day in MM-DD format
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const year = today.getFullYear();
    const monthDay = `${mm}-${dd}`;

    // ── Birthday greetings (per-customer) ────────────────────────────────────
    const birthdayRes = await client.query<{
      id: string;
      name: string;
      phone: string;
    }>(
      `SELECT c.id, c.name, c.phone
       FROM customers c
       WHERE c.phone IS NOT NULL AND c.phone <> ''
         AND c.whatsapp_opt_out = FALSE
         AND c.deleted_at IS NULL
         AND TO_CHAR(c.date_of_birth, 'MM-DD') = $1`,
      [monthDay]
    );

    result.checked += birthdayRes.rows.length;

    for (const cust of birthdayRes.rows) {
      const sentRes = await client.query<{ id: string }>(
        `SELECT id FROM greeting_log
         WHERE customer_id=$1 AND greeting_type='birthday' AND EXTRACT(YEAR FROM sent_at)=$2`,
        [cust.id, year]
      );
      if (sentRes.rows.length > 0) { result.skipped++; continue; }

      const message = `Dear ${cust.name}, wishing you a very Happy Birthday! 🎂 May this special day bring you joy and happiness. Thank you for being a valued customer of Sutra Collections. – Team Sutra Collections`;
      try {
        await sendWhatsAppTemplate(cust.phone, 'sutra_birthday_greeting', [cust.name]);
        await client.query(
          `INSERT INTO greeting_log (customer_id, greeting_type, message_sent, sent_at) VALUES ($1,'birthday',$2,NOW())`,
          [cust.id, message]
        );
        result.sent++;
      } catch (err) {
        result.failed++;
        result.errors.push(`${cust.name} (birthday): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Shop anniversary broadcast (shop-wide setting) ────────────────────────
    // Check if today matches the shop's own anniversary date stored in settings.
    // When it does, send sutra_anniversary_greeting to ALL active opted-in customers.
    const settingsRes = await client.query<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'shop_anniversary_date' LIMIT 1`
    );
    const shopAnnivRaw = settingsRes.rows[0]?.value ?? '';
    // shop_anniversary_date stored as YYYY-MM-DD — compare MM-DD portion
    const shopAnnivMD = shopAnnivRaw.length >= 7 ? shopAnnivRaw.slice(5, 10).replace('-', '-') : '';

    if (shopAnnivMD && shopAnnivMD === monthDay.replace('-', '-')) {
      const allRes = await client.query<{ id: string; name: string; phone: string }>(
        `SELECT c.id, c.name, c.phone
         FROM customers c
         WHERE c.phone IS NOT NULL AND c.phone <> ''
           AND c.whatsapp_opt_out = FALSE
           AND c.deleted_at IS NULL`
      );

      result.checked += allRes.rows.length;

      // sutra_anniversary_greeting was approved with a media header image (logo) —
      // Meta requires header media on every send, so resolve the shop logo to a
      // public URL once for the whole broadcast.
      const logoRes = await client.query<{ value: string }>(
        `SELECT value FROM settings WHERE key = 'company_logo_path' LIMIT 1`
      );
      const logoPath = logoRes.rows[0]?.value ?? '';
      const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
      const logoUrl = logoPath ? `${appBaseUrl}/${logoPath.replace(/^\//, '')}` : null;

      for (const cust of allRes.rows) {
        const sentRes = await client.query<{ id: string }>(
          `SELECT id FROM greeting_log
           WHERE customer_id=$1 AND greeting_type='shop_anniversary' AND EXTRACT(YEAR FROM sent_at)=$2`,
          [cust.id, year]
        );
        if (sentRes.rows.length > 0) { result.skipped++; continue; }

        const message = `Dear ${cust.name}, today is a special day for us at Sutra Collections! 🎉 Thank you for being a cherished part of our journey. – Team Sutra Collections`;
        try {
          await sendWhatsAppTemplate(cust.phone, 'sutra_anniversary_greeting', [cust.name], null, logoUrl);
          await client.query(
            `INSERT INTO greeting_log (customer_id, greeting_type, message_sent, sent_at) VALUES ($1,'shop_anniversary',$2,NOW())`,
            [cust.id, message]
          );
          result.sent++;
        } catch (err) {
          result.failed++;
          result.errors.push(`${cust.name} (shop_anniversary): ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  } finally {
    client.release();
  }

  return result;
}
