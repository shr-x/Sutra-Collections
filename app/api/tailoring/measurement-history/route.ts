import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  await requireRole('admin', 'staff');

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  const designId   = searchParams.get('design_id');

  if (!customerId || !designId) {
    return NextResponse.json({ error: 'customer_id and design_id are required' }, { status: 400 });
  }

  // Load all versions with their values
  const versionsRes = await query(
    `SELECT mv.id, mv.version_number, mv.created_at, u.name AS taken_by_name
     FROM measurement_versions mv
     LEFT JOIN users u ON u.id = mv.taken_by
     WHERE mv.customer_id = $1 AND mv.design_id = $2
     ORDER BY mv.version_number DESC`,
    [customerId, designId]
  );

  if (versionsRes.rows.length === 0) {
    return NextResponse.json({ versions: [] });
  }

  type VersionRow = { id: string; version_number: number; created_at: string; taken_by_name: string | null };
  const versionIds = (versionsRes.rows as VersionRow[]).map((v) => v.id);

  const valuesRes = await query(
    `SELECT mv.version_id, mv.field_id, mv.value
     FROM measurement_values mv
     WHERE mv.version_id = ANY($1::uuid[])`,
    [versionIds]
  );

  // Group values by version_id
  const valuesByVersion: Record<string, Array<{ field_id: string; value: string }>> = {};
  for (const row of valuesRes.rows) {
    if (!valuesByVersion[row.version_id]) valuesByVersion[row.version_id] = [];
    valuesByVersion[row.version_id].push({ field_id: row.field_id, value: row.value });
  }

  const versions = (versionsRes.rows as VersionRow[]).map((v) => ({
    id:             v.id,
    version_number: v.version_number,
    created_at:     v.created_at,
    taken_by_name:  v.taken_by_name,
    values:         valuesByVersion[v.id] ?? [],
  }));

  return NextResponse.json({ versions });
}
