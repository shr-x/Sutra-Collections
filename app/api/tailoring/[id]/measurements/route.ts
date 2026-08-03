import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * Returns the design's measurement field definitions, the order's current
 * (latest) measurement values keyed by field_id, and the order's current due
 * date. Used to pre-fill the measurement grid and due-date field inside the
 * Request Alteration modal, wherever it's opened from (order detail page or
 * the production board).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole('admin', 'staff');
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orderRes = await query<{ design_id: string; measurement_version_id: string | null; due_date: string | null }>(
    `SELECT design_id, measurement_version_id, due_date::text FROM tailoring_orders WHERE id=$1`,
    [params.id]
  );
  const order = orderRes.rows[0];
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const fieldsRes = await query<{ id: string; field_name: string; field_type: 'number' | 'text'; unit: string | null }>(
    `SELECT id, field_name, field_type, unit
     FROM design_measurement_fields WHERE design_id=$1
     ORDER BY sort_order, field_name`,
    [order.design_id]
  );

  const currentMeasurements: Record<string, string> = {};
  if (order.measurement_version_id) {
    const valRes = await query<{ field_id: string; value: string }>(
      `SELECT field_id, value FROM measurement_values WHERE version_id=$1`,
      [order.measurement_version_id]
    );
    for (const row of valRes.rows) currentMeasurements[row.field_id] = row.value;
  }

  return NextResponse.json({ fields: fieldsRes.rows, currentMeasurements, dueDate: order.due_date });
}
