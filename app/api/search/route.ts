import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';

export interface SearchResult {
  type: 'customer' | 'invoice' | 'item' | 'tailoring';
  id: string;
  label: string;
  sub: string;
  href: string;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const q = req.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) return NextResponse.json({ results: [] });

    const like = `%${q}%`;
    const results: SearchResult[] = [];

    const [custRes, invRes, itemRes, tailRes] = await Promise.all([
      // Customers — admin & staff only (not accountant)
      session.role !== 'accountant'
        ? pool.query(
            `SELECT id, name, phone FROM customers
             WHERE (name ILIKE $1 OR phone ILIKE $1) AND deleted_at IS NULL LIMIT 5`,
            [like]
          )
        : Promise.resolve({ rows: [] }),

      // Invoices
      pool.query(
        `SELECT i.id, i.invoice_number, c.name AS customer_name
         FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
         WHERE i.invoice_number ILIKE $1 LIMIT 5`,
        [like]
      ),

      // Items
      session.role !== 'accountant'
        ? pool.query(
            `SELECT id, name, unit FROM items WHERE name ILIKE $1 AND is_active = TRUE LIMIT 5`,
            [like]
          )
        : Promise.resolve({ rows: [] }),

      // Tailoring orders
      session.role !== 'accountant'
        ? pool.query(
            `SELECT t.id, t.order_number, c.name AS customer_name
             FROM tailoring_orders t LEFT JOIN customers c ON c.id = t.customer_id
             WHERE t.order_number ILIKE $1 LIMIT 3`,
            [like]
          ).catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
    ]);

    for (const row of custRes.rows) {
      results.push({
        type: 'customer', id: row.id as string,
        label: row.name as string,
        sub: (row.phone as string | null) ?? '',
        href: `/customers/${row.id as string}`,
      });
    }
    for (const row of invRes.rows) {
      results.push({
        type: 'invoice', id: row.id as string,
        label: row.invoice_number as string,
        sub: (row.customer_name as string | null) ?? '',
        href: `/billing/invoices/${row.id as string}`,
      });
    }
    for (const row of itemRes.rows) {
      results.push({
        type: 'item', id: row.id as string,
        label: row.name as string,
        sub: row.unit as string,
        href: `/inventory/items/${row.id as string}`,
      });
    }
    for (const row of tailRes.rows) {
      results.push({
        type: 'tailoring', id: row.id as string,
        label: row.order_number as string,
        sub: (row.customer_name as string | null) ?? '',
        href: `/tailoring/${row.id as string}`,
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
