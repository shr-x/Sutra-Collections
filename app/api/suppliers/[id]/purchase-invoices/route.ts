import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { rows } = await query(
      `SELECT id, purchase_number, purchase_date, grand_total, amount_paid, status
       FROM purchase_invoices
       WHERE supplier_id = $1
       ORDER BY purchase_date DESC
       LIMIT 100`,
      [params.id]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[GET /api/suppliers/[id]/purchase-invoices]', err);
    return NextResponse.json({ error: 'Failed to load purchase invoices' }, { status: 500 });
  }
}
