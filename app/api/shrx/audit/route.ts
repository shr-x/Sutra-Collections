import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireShrx } from '@/lib/shrx/session';

export async function GET(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const { rows } = await query(
    'SELECT id, created_at, action, target, details, ip FROM shrx_audit_log ORDER BY created_at DESC LIMIT 500'
  );
  return NextResponse.json({ rows });
}
