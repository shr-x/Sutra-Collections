import { query } from '@/lib/db';
import { PoolClient } from 'pg';

type DocType = 'INV' | 'QUO' | 'CN' | 'DN' | 'PUR' | 'TO' | 'TG';

function currentFY(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-based
  const year = now.getFullYear();
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

/** Atomically increment and return the next sequence number. Must be called inside a transaction. */
export async function nextInvoiceNumber(
  type: DocType,
  client?: PoolClient
): Promise<string> {
  const fy = currentFY();
  const exec = client
    ? (sql: string, params: unknown[]) => client.query(sql, params)
    : (sql: string, params: unknown[]) => query(sql, params);

  // Upsert the sequence row and increment atomically
  const res = await exec(
    `INSERT INTO invoice_sequences (type, financial_year, last_number)
     VALUES ($1, $2, 1)
     ON CONFLICT (type) DO UPDATE SET
       last_number = CASE
         WHEN invoice_sequences.financial_year <> EXCLUDED.financial_year
           THEN 1
         ELSE invoice_sequences.last_number + 1
       END,
       financial_year = EXCLUDED.financial_year
     RETURNING last_number, financial_year`,
    [type, fy]
  );

  const { last_number, financial_year } = res.rows[0];
  const padded = String(last_number).padStart(4, '0');
  return `${type}/${financial_year}/${padded}`;
}

/**
 * Returns a plain sequential integer string (e.g. "27") for grouped tailoring order display.
 * Resets each financial year, same mechanism as nextInvoiceNumber.
 * Customer sees "Order #27"; tailor sees "#27A" / "#27B".
 */
export async function nextTailoringGroupNumber(client?: PoolClient): Promise<string> {
  const fy = currentFY();
  const exec = client
    ? (sql: string, params: unknown[]) => client.query(sql, params)
    : (sql: string, params: unknown[]) => query(sql, params);

  const res = await exec(
    `INSERT INTO invoice_sequences (type, financial_year, last_number)
     VALUES ($1, $2, 1)
     ON CONFLICT (type) DO UPDATE SET
       last_number = CASE
         WHEN invoice_sequences.financial_year <> EXCLUDED.financial_year
           THEN 1
         ELSE invoice_sequences.last_number + 1
       END,
       financial_year = EXCLUDED.financial_year
     RETURNING last_number`,
    ['TG', fy]
  );

  return String(res.rows[0].last_number);
}
