import type { PoolClient } from 'pg';

function makePrefix(itemName: string): string {
  const prefix = itemName
    .split(/\s+/)
    .map((w) => (w[0] ?? '').toUpperCase())
    .join('')
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
  return prefix || 'IT';
}

/**
 * Generates one sticker code per physical unit on the purchase invoice.
 * Must be called inside an open transaction (before COMMIT).
 * Idempotent — skips if codes already exist for this invoice.
 */
export async function generateStickersForPurchase(
  client: PoolClient,
  purchaseInvoiceId: string,
): Promise<number> {
  const existCheck = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM sticker_codes WHERE purchase_invoice_id = $1`,
    [purchaseInvoiceId],
  );
  if (Number(existCheck.rows[0].c) > 0) return 0;

  const lines = await client.query<{
    item_id: string; item_name: string;
    size_id: string | null; color_id: string | null;
    quantity: number; sale_price: string | null;
  }>(
    // Sticker price is the item's SALE price (what the customer pays), never
    // the purchase rate paid to the supplier — pii.rate is deliberately not
    // selected here.
    `SELECT pii.item_id, it.name AS item_name,
            pii.size_id, pii.color_id,
            pii.quantity::int AS quantity, it.sale_price::text
     FROM purchase_invoice_items pii
     JOIN items it ON it.id = pii.item_id
     WHERE pii.purchase_invoice_id = $1`,
    [purchaseInvoiceId],
  );

  let generated = 0;
  for (const line of lines.rows) {
    const prefix = makePrefix(line.item_name);
    const qty = Number(line.quantity);
    const salePrice = Number(line.sale_price ?? 0);
    for (let i = 0; i < qty; i++) {
      const seqRes = await client.query<{ n: string }>(
        `SELECT nextval('sticker_code_seq')::text AS n`,
      );
      const n = seqRes.rows[0].n;
      const code = `${prefix}-${String(n).padStart(4, '0')}`;
      await client.query(
        `INSERT INTO sticker_codes (code, item_id, purchase_invoice_id, size_id, color_id, price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [code, line.item_id, purchaseInvoiceId,
         line.size_id ?? null, line.color_id ?? null, salePrice],
      );
      generated++;
    }
  }
  return generated;
}
