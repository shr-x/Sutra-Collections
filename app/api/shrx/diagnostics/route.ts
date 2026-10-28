import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireShrx } from '@/lib/shrx/session';

// Read-only numbers the owner asked to see before deciding on old data.
export async function GET(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  // Retail invoices cancelled before cancel started posting reversals (Oct 2026):
  // they still have a sale journal entry and no reversal entry.
  const r = await query<{ n: string; total: string }>(
    `SELECT COUNT(*)::text AS n, COALESCE(SUM(i.grand_total),0)::text AS total
     FROM invoices i
     WHERE i.status = 'cancelled' AND i.source <> 'tailoring'
       AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'invoice')
       AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'reversal')`
  );
  return NextResponse.json({
    cancelledRetailWithoutReversal: { count: Number(r.rows[0].n), total: Number(r.rows[0].total) },
  });
}
