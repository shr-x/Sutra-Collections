import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    size_id: string;
    color_id: string;
    warehouse_id: string;
    quantity: number;
  };

  const { size_id, color_id, warehouse_id, quantity } = body;
  if (!size_id || !color_id || !warehouse_id || quantity == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Get previous qty for the movement delta
  const prevRes = await query(
    `SELECT COALESCE(quantity,0) as quantity FROM stock
     WHERE item_id=$1 AND size_id=$2 AND color_id=$3 AND warehouse_id=$4`,
    [params.id, size_id, color_id, warehouse_id]
  );
  const prevQty = Number(prevRes.rows[0]?.quantity ?? 0);
  const delta = quantity - prevQty;

  await query(
    `INSERT INTO stock (item_id, size_id, color_id, warehouse_id, quantity)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (item_id, warehouse_id, size_id, color_id) WHERE size_id IS NOT NULL AND color_id IS NOT NULL
     DO UPDATE SET quantity = EXCLUDED.quantity`,
    [params.id, size_id, color_id, warehouse_id, quantity]
  );

  if (delta !== 0) {
    await query(
      `INSERT INTO stock_movements (item_id, warehouse_id, movement_type, quantity, notes, created_by)
       VALUES ($1,$2,$3,$4,'Manual stock adjustment',$5)`,
      [params.id, warehouse_id, delta > 0 ? 'adjustment_in' : 'adjustment_out', Math.abs(delta), session.userId]
    );
  }

  return NextResponse.json({ quantity });
}
