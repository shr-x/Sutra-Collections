/**
 * Low-stock alert runner.
 * Sends sutra_low_stock_alert to the admin WhatsApp number when item stock
 * falls at or below the configured threshold.
 * Deduplicates: won't re-alert for the same item within 24 hours.
 */

import { pool } from '@/lib/db';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';

export interface LowStockRunResult {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function runLowStockAlerts(): Promise<LowStockRunResult> {
  const result: LowStockRunResult = { checked: 0, sent: 0, skipped: 0, failed: 0, errors: [] };

  const client = await pool.connect();
  try {
    // Self-healing migrations
    await client.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS last_low_stock_alert TIMESTAMPTZ`).catch(() => {});
    await client.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(12,3)`).catch(() => {});

    // Read admin phone + global low-stock threshold from settings
    const cfgRes = await client.query<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key IN ('admin_whatsapp', 'low_stock_threshold')`
    );
    const cfg = Object.fromEntries(cfgRes.rows.map((r) => [r.key, r.value]));
    const adminPhone = (cfg.admin_whatsapp ?? '').trim();
    const threshold  = Math.max(0, Number(cfg.low_stock_threshold ?? 5));

    if (!adminPhone) {
      console.log('[low-stock] No admin_whatsapp configured — skipping');
      return result;
    }

    // Items at or below the global threshold that haven't been alerted in the last 24 hours
    const rows = await client.query<{
      item_id: string;
      item_name: string;
      unit: string;
      total_stock: string;
    }>(
      `SELECT i.id AS item_id, i.name AS item_name, i.unit,
              COALESCE(SUM(s.quantity), 0)::text AS total_stock
       FROM items i
       LEFT JOIN stock s ON s.item_id = i.id
       WHERE i.is_active = TRUE
         AND i.item_type = 'finished'
         AND (i.last_low_stock_alert IS NULL
              OR i.last_low_stock_alert < NOW() - INTERVAL '24 hours')
       GROUP BY i.id, i.name, i.unit
       HAVING COALESCE(SUM(s.quantity), 0) <= $1`,
      [threshold]
    );

    result.checked = rows.rows.length;

    for (const row of rows.rows) {
      const stockQty = Math.max(0, Math.round(Number(row.total_stock)));
      try {
        // {{1}}=item name, {{2}}=stock qty, {{3}}=unit
        const waRes = await sendWhatsAppTemplate(adminPhone, 'sutra_low_stock_alert', [
          row.item_name,
          String(stockQty),
          row.unit,
        ]);

        if (waRes.success) {
          await client.query(
            `UPDATE items SET last_low_stock_alert = NOW() WHERE id = $1`,
            [row.item_id]
          );
          result.sent++;
        } else {
          result.failed++;
          result.errors.push(`${row.item_name}: ${waRes.error}`);
        }
      } catch (err) {
        result.failed++;
        result.errors.push(`${row.item_name}: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }

  return result;
}

/**
 * Check low stock for specific items after a stock movement.
 * Called after purchase saves and invoice creates (fire-and-forget).
 */
export async function checkLowStockForItems(itemIds: string[]): Promise<void> {
  if (!itemIds.length) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS last_low_stock_alert TIMESTAMPTZ`).catch(() => {});
      await client.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(12,3)`).catch(() => {});

      const cfgRes = await client.query<{ key: string; value: string }>(
        `SELECT key, value FROM settings WHERE key IN ('admin_whatsapp', 'low_stock_threshold')`
      );
      const cfg = Object.fromEntries(cfgRes.rows.map((r) => [r.key, r.value]));
      const adminPhone = (cfg.admin_whatsapp ?? '').trim();
      const threshold  = Math.max(0, Number(cfg.low_stock_threshold ?? 5));
      if (!adminPhone) return;

      const rows = await client.query<{
        item_id: string; item_name: string; unit: string; total_stock: string;
      }>(
        `SELECT i.id AS item_id, i.name AS item_name, i.unit,
                COALESCE(SUM(s.quantity), 0)::text AS total_stock
         FROM items i
         LEFT JOIN stock s ON s.item_id = i.id
         WHERE i.id = ANY($1::uuid[])
           AND i.is_active = TRUE
           AND (i.last_low_stock_alert IS NULL
                OR i.last_low_stock_alert < NOW() - INTERVAL '24 hours')
         GROUP BY i.id, i.name, i.unit
         HAVING COALESCE(SUM(s.quantity), 0) <= $2`,
        [itemIds, threshold]
      );

      for (const row of rows.rows) {
        const stockQty = Math.max(0, Math.round(Number(row.total_stock)));
        sendWhatsAppTemplate(adminPhone, 'sutra_low_stock_alert', [
          row.item_name,
          String(stockQty),
          row.unit,
        ]).then((r) => {
          if (r.success) {
            client.query(
              `UPDATE items SET last_low_stock_alert = NOW() WHERE id = $1`,
              [row.item_id]
            ).catch(() => {});
          }
        }).catch(() => {});
      }
    } finally {
      client.release();
    }
  } catch {
    // fire-and-forget — never throw
  }
}
