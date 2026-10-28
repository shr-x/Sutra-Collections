import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

// Every order in the same batch/group as :id (including :id itself), for the
// linked-orders popup. Works from any member of the group.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.group_number, o.suffix, o.status,
              d.name AS design_name, o.color_fabric,
              o.total_amount::float AS total_amount,
              o.amount_paid::float AS amount_paid,
              GREATEST(0, ROUND((o.total_amount - o.amount_paid)::numeric, 2))::float AS balance
       FROM tailoring_orders me
       JOIN tailoring_orders o ON o.batch_id = me.batch_id
       JOIN designs d ON d.id = o.design_id
       WHERE me.id = $1 AND me.batch_id IS NOT NULL
       ORDER BY o.suffix ASC NULLS LAST, o.created_at ASC`,
      [params.id]
    );
    return NextResponse.json({ orders: rows });
  } catch (err) {
    console.error('[GET /api/tailoring/[id]/group]', err);
    return NextResponse.json({ error: 'Failed to load linked orders' }, { status: 500 });
  }
}
