import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * Returns the "Tailoring Services" system item, creating it on first call.
 * Used by the invoice builder when adding tailoring orders as line items.
 */
export async function GET() {
  try {
    await requireRole('admin', 'staff');
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find existing
  const existing = await query<{ id: string; gst_rate: string; hsn_code: string | null }>(
    `SELECT id, gst_rate, hsn_code FROM items
     WHERE name = 'Tailoring Services' AND item_type = 'service' LIMIT 1`
  );

  if (existing.rows[0]) {
    return NextResponse.json({
      id: existing.rows[0].id,
      name: 'Tailoring Services',
      gst_rate: Number(existing.rows[0].gst_rate),
      hsn_code: existing.rows[0].hsn_code ?? '9988',
      unit: 'pcs',
    });
  }

  // Create system item
  const created = await query<{ id: string }>(
    `INSERT INTO items (name, unit, item_type, gst_rate, hsn_code, is_active)
     VALUES ('Tailoring Services', 'pcs', 'service', 5, '9988', true)
     RETURNING id`
  );

  return NextResponse.json({
    id: created.rows[0].id,
    name: 'Tailoring Services',
    gst_rate: 5,
    hsn_code: '9988',
    unit: 'pcs',
  });
}
