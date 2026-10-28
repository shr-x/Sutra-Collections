import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireShrx, shrxAudit } from '@/lib/shrx/session';

// "Failed updates": errors from best-effort sync paths (lib/app-error-log.ts).
export async function GET(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const { rows } = await query(
    `SELECT id, created_at, context, entity_type, entity_id, message, details
     FROM app_error_log ORDER BY created_at DESC LIMIT 500`
  );
  await shrxAudit('view.failed_updates', null, null, g.ip);
  return NextResponse.json({ rows });
}
