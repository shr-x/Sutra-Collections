import { query } from '@/lib/db';

// Shared by the Find Product report page and its CSV export so both always
// show the same numbers.
//
// "Item code": items have no dedicated code column, so a search matches
//   - the item name (case-insensitive substring),
//   - a sticker code printed on the unit (sticker_codes.code → item_id),
//   - a legacy variant SKU (item_variants.sku → item_id).
//
// Tailoring is not included: tailoring invoices bill a single "Tailoring
// Service" line that never links to a stocked item, and tailoring orders
// themselves have no item reference.

export interface ProductMatch {
  id: string;
  name: string;
  item_type: string;
  matched_via: string;
}

export interface SaleRow {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  month: string;
  customer_id: string | null;
  customer_name: string | null;
  variant: string | null;
  quantity: string;
  rate: string;
  amount: string;
}

export interface ReturnRow {
  credit_note_id: string;
  credit_note_number: string;
  invoice_id: string | null;
  invoice_number: string | null;
  return_date: string;
  month: string;
  customer_id: string | null;
  customer_name: string | null;
  quantity: string;
  rate: string;
  amount: string;
}

export interface MonthRow {
  month: string;
  sold_qty: number;
  sold_amount: number;
  returned_qty: number;
  returned_amount: number;
}

export async function searchProducts(q: string): Promise<ProductMatch[]> {
  const term = q.trim();
  if (term.length < 1) return [];
  const { rows } = await query<ProductMatch>(
    `SELECT it.id, it.name, it.item_type,
            CASE
              WHEN EXISTS (SELECT 1 FROM sticker_codes sc WHERE sc.item_id = it.id AND UPPER(sc.code) = UPPER($1)) THEN 'sticker code'
              WHEN EXISTS (SELECT 1 FROM item_variants iv WHERE iv.item_id = it.id AND UPPER(iv.sku) = UPPER($1)) THEN 'SKU'
              ELSE 'name'
            END AS matched_via
     FROM items it
     WHERE it.item_type <> 'service'
       AND (
         it.name ILIKE '%' || $1 || '%'
         OR EXISTS (SELECT 1 FROM sticker_codes sc WHERE sc.item_id = it.id AND UPPER(sc.code) = UPPER($1))
         OR EXISTS (SELECT 1 FROM item_variants iv WHERE iv.item_id = it.id AND UPPER(iv.sku) = UPPER($1))
       )
     ORDER BY (it.name ILIKE $1) DESC, it.is_active DESC, it.name
     LIMIT 50`,
    [term]
  );
  return rows;
}

export interface ProductReportFilters {
  itemId: string;
  from: string | null;
  to: string | null;
}

export async function getProductReport(f: ProductReportFilters) {
  const params = [f.itemId, f.from, f.to];

  const [itemRes, salesRes, returnsRes] = await Promise.all([
    query<{ id: string; name: string; hsn_code: string | null }>(
      'SELECT id, name, hsn_code FROM items WHERE id=$1', [f.itemId]
    ),
    // Sales: excludes cancelled + draft invoices and tailoring invoices.
    query<SaleRow>(
      `SELECT i.id AS invoice_id, i.invoice_number, i.invoice_date::text AS invoice_date,
              to_char(i.invoice_date, 'YYYY-MM') AS month,
              i.customer_id, c.name AS customer_name,
              NULLIF(CONCAT_WS(' / ', COALESCE(iv.color, cl.color_name), COALESCE(iv.size, sz.size_name)), '') AS variant,
              ii.quantity::text, ii.rate::text, ii.total_amount::text AS amount
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN item_variants iv ON iv.id = ii.variant_id
       LEFT JOIN item_sizes sz ON sz.id = ii.size_id
       LEFT JOIN item_colors cl ON cl.id = ii.color_id
       WHERE ii.item_id = $1
         AND i.status NOT IN ('cancelled','draft')
         AND i.source <> 'tailoring'
         AND ($2::date IS NULL OR i.invoice_date >= $2::date)
         AND ($3::date IS NULL OR i.invoice_date <= $3::date)
       ORDER BY i.invoice_date DESC, i.invoice_number DESC`,
      params
    ),
    // Returns (refunds / credit notes) for the item, dated by the credit note.
    query<ReturnRow>(
      `SELECT cn.id AS credit_note_id, cn.credit_note_number,
              cn.invoice_id, i.invoice_number,
              (cn.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS return_date,
              to_char(cn.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month,
              cn.customer_id, c.name AS customer_name,
              cni.quantity::text, cni.rate::text, cni.total_amount::text AS amount
       FROM credit_note_items cni
       JOIN credit_notes cn ON cn.id = cni.credit_note_id
       LEFT JOIN invoices i ON i.id = cn.invoice_id
       LEFT JOIN customers c ON c.id = cn.customer_id
       WHERE cni.item_id = $1
         AND cn.status <> 'draft'
         AND ($2::date IS NULL OR (cn.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $2::date)
         AND ($3::date IS NULL OR (cn.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $3::date)
       ORDER BY cn.created_at DESC`,
      params
    ),
  ]);

  const sales = salesRes.rows;
  const returns = returnsRes.rows;

  const byMonth = new Map<string, MonthRow>();
  const bucket = (m: string) => {
    let r = byMonth.get(m);
    if (!r) { r = { month: m, sold_qty: 0, sold_amount: 0, returned_qty: 0, returned_amount: 0 }; byMonth.set(m, r); }
    return r;
  };
  for (const s of sales) {
    const b = bucket(s.month);
    b.sold_qty += Number(s.quantity);
    b.sold_amount += Number(s.amount);
  }
  for (const r of returns) {
    const b = bucket(r.month);
    b.returned_qty += Number(r.quantity);
    b.returned_amount += Number(r.amount);
  }
  const months = Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month));

  const totals = months.reduce(
    (t, m) => ({
      sold_qty: t.sold_qty + m.sold_qty,
      sold_amount: t.sold_amount + m.sold_amount,
      returned_qty: t.returned_qty + m.returned_qty,
      returned_amount: t.returned_amount + m.returned_amount,
    }),
    { sold_qty: 0, sold_amount: 0, returned_qty: 0, returned_amount: 0 }
  );

  return { item: itemRes.rows[0] ?? null, sales, returns, months, totals };
}

/** "2026-10" → "Oct 2026" */
export function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}
