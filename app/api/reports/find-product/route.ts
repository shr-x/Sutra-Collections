import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getProductReport, monthLabel } from '@/lib/reports/find-product';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export async function GET(req: NextRequest) {
  // Same access as the page (admin only — includes customer names).
  await requireRole('admin');

  const sp = new URL(req.url).searchParams;
  const itemId = sp.get('item_id') ?? '';
  if (!UUID_RE.test(itemId)) return NextResponse.json({ error: 'item_id required' }, { status: 400 });
  const from = DATE_RE.test(sp.get('from') ?? '') ? sp.get('from') : null;
  const to   = DATE_RE.test(sp.get('to') ?? '') ? sp.get('to') : null;

  const r = await getProductReport({ itemId, from, to });
  if (!r.item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  const rows: (string | number)[][] = [
    ['Product', r.item.name],
    ['Period', `${from ?? 'Start'} to ${to ?? 'Today'}`],
    [],
    ['Monthly summary'],
    ['Month', 'Units sold', 'Amount', 'Units returned', 'Returned amount', 'Net amount'],
    ...r.months.map((m) => [
      monthLabel(m.month), m.sold_qty, m.sold_amount.toFixed(2),
      m.returned_qty, m.returned_amount.toFixed(2), (m.sold_amount - m.returned_amount).toFixed(2),
    ]),
    ['Total', r.totals.sold_qty, r.totals.sold_amount.toFixed(2),
      r.totals.returned_qty, r.totals.returned_amount.toFixed(2),
      (r.totals.sold_amount - r.totals.returned_amount).toFixed(2)],
    [],
    // Returns are listed as negative rows after the sales.
    ['Type', 'Document', 'Against invoice', 'Date', 'Month', 'Customer', 'Variant', 'Quantity', 'Rate', 'Amount'],
    ...r.sales.map((s) => [
      'Sale', s.invoice_number, '', s.invoice_date, monthLabel(s.month),
      s.customer_name ?? 'Walk-in', s.variant ?? '', s.quantity, s.rate, s.amount,
    ]),
    ...r.returns.map((x) => [
      'Return', x.credit_note_number, x.invoice_number ?? '', x.return_date, monthLabel(x.month),
      x.customer_name ?? 'Walk-in', '', `-${x.quantity}`, x.rate, `-${x.amount}`,
    ]),
  ];

  const slug = r.item.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'product';
  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="find-product-${slug}.csv"`,
    },
  });
}
