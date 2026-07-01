import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await query(
    `SELECT id, invoice_number, invoice_date, grand_total, amount_paid,
            (grand_total - amount_paid) AS balance_due
     FROM invoices
     WHERE customer_id = $1
       AND status IN ('issued', 'partially_paid', 'overdue')
       AND grand_total > amount_paid
     ORDER BY invoice_date ASC
     LIMIT 10`,
    [params.id]
  );

  const totalDue = rows.reduce((sum, r) => sum + Number(r.balance_due), 0);
  return NextResponse.json({ totalDue, invoices: rows });
}
