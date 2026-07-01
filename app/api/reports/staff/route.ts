import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

function csv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export async function GET(req: NextRequest) {
  await requireRole('admin');

  const sp    = new URL(req.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from  = sp.get('from') ?? today.slice(0, 7) + '-01';
  const to    = sp.get('to')   ?? today;

  const res = await query(
    `SELECT u.name, u.role,
            COUNT(DISTINCT i.id)::int           AS invoice_count,
            COALESCE(SUM(i.grand_total),0)       AS total_sales,
            COALESCE(SUM(i.amount_paid),0)       AS total_collected
     FROM users u
     LEFT JOIN invoices i ON i.created_by=u.id
       AND i.invoice_date BETWEEN $1 AND $2
       AND i.status NOT IN ('cancelled','draft')
     WHERE u.role IN ('admin','staff')
     GROUP BY u.id, u.name, u.role ORDER BY total_sales DESC`,
    [from, to]
  );

  const header = ['Staff Name','Role','Invoices','Total Sales','Collected'];
  const data: string[][] = [
    header,
    ...res.rows.map((r) => [r.name, r.role, r.invoice_count, r.total_sales, r.total_collected]),
  ];

  return new NextResponse(csv(data), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="staff-${from}-${to}.csv"`,
    },
  });
}
