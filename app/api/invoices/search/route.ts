import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);

  const like = `%${q}%`;

  const { rows } = await query(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.grand_total, i.amount_paid, i.status,
            c.name AS customer_name, c.phone AS customer_phone
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.status NOT IN ('cancelled', 'draft')
       AND (
         i.invoice_number ILIKE $1
         OR c.name ILIKE $1
         OR c.phone ILIKE $1
         OR RIGHT(i.invoice_number, 4) = $2
       )
     ORDER BY i.created_at DESC
     LIMIT 10`,
    [like, q]
  );

  return NextResponse.json(rows);
}
