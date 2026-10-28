import { query } from '@/lib/db';

export interface WaLogEntity { type: string; id: string | null; label: string }

// Document numbers carried in template parameters, e.g. "INV/2026-27/0004",
// "TO/2026-27/0012-B" (or the group "TO/2026-27/0012"), "CN/…", "DN/…".
const NUMBER_RE = /\b(INV|TO|CN|DN)\/\d{4}-\d{2}\/\d+(?:-[A-Z])?\b/;

/**
 * Best guess of the invoice/order a message is about, from its parameters,
 * so all 30+ call sites get the "related entity" column without each one
 * passing it explicitly. Returns null when nothing matches.
 */
export async function inferWaEntity(parameters: string[]): Promise<WaLogEntity | null> {
  for (const p of parameters) {
    const m = typeof p === 'string' ? p.match(NUMBER_RE) : null;
    if (!m) continue;
    const label = m[0];
    const kind = m[1];
    const lookup: Record<string, [string, string]> = {
      INV: ['invoice', `SELECT id FROM invoices WHERE invoice_number=$1 LIMIT 1`],
      CN:  ['credit_note', `SELECT id FROM credit_notes WHERE credit_note_number=$1 LIMIT 1`],
      DN:  ['debit_note', `SELECT id FROM debit_notes WHERE debit_note_number=$1 LIMIT 1`],
      TO:  ['tailoring_order', `SELECT id FROM tailoring_orders WHERE order_number=$1 OR group_number=$1 ORDER BY order_number LIMIT 1`],
    };
    const [type, sql] = lookup[kind];
    const res = await query<{ id: string }>(sql, [label]).catch(() => ({ rows: [] as { id: string }[] }));
    return { type, id: res.rows[0]?.id ?? null, label };
  }
  return null;
}

/** Customer for a phone number (customers.phone is unique). Compares the last 10 digits. */
export async function customerIdForPhone(phone: string): Promise<string | null> {
  const digits = (phone ?? '').replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return null;
  const res = await query<{ id: string }>(
    `SELECT id FROM customers WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = $1 LIMIT 1`, [digits]
  ).catch(() => ({ rows: [] as { id: string }[] }));
  return res.rows[0]?.id ?? null;
}

/** Insert one log row. Never throws. */
export async function writeWaLog(row: {
  customerId: string | null; phone: string; templateName: string;
  status: 'sent' | 'failed' | 'skipped';
  errorCode?: string | number | null; errorMessage?: string | null;
  entity?: WaLogEntity | null; messageId?: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO whatsapp_message_log
         (customer_id, phone, template_name, status, error_code, error_message, entity_type, entity_id, entity_label, message_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [row.customerId, row.phone, row.templateName, row.status,
       row.errorCode != null ? String(row.errorCode) : null, row.errorMessage?.slice(0, 2000) ?? null,
       row.entity?.type ?? null, row.entity?.id ?? null, row.entity?.label ?? null, row.messageId ?? null]
    );
  } catch (err) {
    console.error('[whatsapp-log] could not write log row:', err);
  }
}
