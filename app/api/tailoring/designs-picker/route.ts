import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  try {
    await requireRole('admin', 'staff');
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const designsRes = await query<{ id: string; name: string; category: string | null }>(
    `SELECT id, name, category FROM designs ORDER BY name`
  );

  const fieldsRes = await query<{
    design_id: string; id: string; field_name: string;
    field_type: string; unit: string | null; sort_order: number;
  }>(
    `SELECT design_id, id, field_name, field_type, unit, sort_order
     FROM design_measurement_fields ORDER BY design_id, sort_order, field_name`
  );

  const fieldsByDesign: Record<string, typeof fieldsRes.rows> = {};
  for (const f of fieldsRes.rows) {
    (fieldsByDesign[f.design_id] ??= []).push(f);
  }

  const designs = designsRes.rows.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    fields: fieldsByDesign[d.id] ?? [],
  }));

  return NextResponse.json({ designs });
}
