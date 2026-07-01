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
      `SELECT pii.id, pii.item_id, it.name AS item_name, pii.variant_id,
              pii.quantity, pii.rate, pii.gst_rate, pii.hsn_code,
              p.warehouse_id,
              COALESCE((
                SELECT SUM(s.quantity) FROM stock s
                WHERE s.item_id = pii.item_id AND s.warehouse_id = p.warehouse_id
              ), 0) AS current_stock,
              COALESCE((
                SELECT SUM(dni.quantity) FROM debit_note_items dni
                JOIN debit_notes dn ON dn.id = dni.debit_note_id
                WHERE dni.purchase_invoice_item_id = pii.id
                  AND dn.status != 'cancelled'
              ), 0) AS already_returned
       FROM purchase_invoice_items pii
       JOIN items it ON it.id = pii.item_id
       JOIN purchase_invoices p ON p.id = pii.purchase_invoice_id
       WHERE pii.purchase_invoice_id = $1
       ORDER BY pii.sort_order`,
      [params.id]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[GET /api/purchase-invoices/[id]/items]', err);
    return NextResponse.json({ error: 'Failed to load items' }, { status: 500 });
  }
}
