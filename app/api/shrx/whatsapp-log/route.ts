import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireShrx, shrxAudit } from '@/lib/shrx/session';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// WhatsApp message log with filters: status, date range, template, customer (name/phone).
export async function GET(req: NextRequest) {
  const g = await requireShrx(req);
  if (g instanceof NextResponse) return g;
  const sp = req.nextUrl.searchParams;
  const status = ['sent', 'failed', 'skipped'].includes(sp.get('status') ?? '') ? sp.get('status') : null;
  const from = DATE_RE.test(sp.get('from') ?? '') ? sp.get('from') : null;
  const to = DATE_RE.test(sp.get('to') ?? '') ? sp.get('to') : null;
  const template = sp.get('template') || null;
  const customer = sp.get('customer')?.trim() || null;

  const { rows } = await query(
    `SELECT w.id, w.created_at, w.customer_id, c.name AS customer_name, w.phone, w.template_name, w.status,
            w.error_code, w.error_message, w.entity_type, w.entity_id, w.entity_label
     FROM whatsapp_message_log w
     LEFT JOIN customers c ON c.id = w.customer_id
     WHERE ($1::text IS NULL OR w.status = $1)
       AND ($2::date IS NULL OR (w.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $2::date)
       AND ($3::date IS NULL OR (w.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $3::date)
       AND ($4::text IS NULL OR w.template_name = $4)
       AND ($5::text IS NULL OR c.name ILIKE '%' || $5 || '%' OR w.phone ILIKE '%' || $5 || '%')
     ORDER BY w.created_at DESC
     LIMIT 500`,
    [status, from, to, template, customer]
  );
  const templates = await query<{ template_name: string }>(
    'SELECT DISTINCT template_name FROM whatsapp_message_log ORDER BY 1'
  );
  await shrxAudit('view.whatsapp_log', null, { status, from, to, template, customer }, g.ip);
  return NextResponse.json({ rows, templates: templates.rows.map((t) => t.template_name) });
}
