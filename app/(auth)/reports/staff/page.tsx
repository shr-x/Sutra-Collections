import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'Staff Performance' };

export default async function StaffPerformancePage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  await requireRole('admin');

  // Gate: only show when staff_module_enabled is true in settings
  const settRes = await query<{ staff_module_enabled: boolean }>(
    'SELECT staff_module_enabled FROM settings LIMIT 1'
  );
  if (!settRes.rows[0]?.staff_module_enabled) {
    redirect('/reports');
  }

  const today = new Date().toISOString().slice(0, 10);
  const from  = searchParams.from ?? today.slice(0, 7) + '-01';
  const to    = searchParams.to   ?? today;

  let dbError: string | null = null;
  const res = await query(
    `SELECT u.id, u.name, u.role,
            COUNT(DISTINCT i.id)::int                       AS invoice_count,
            COALESCE(SUM(i.grand_total),0)                  AS total_sales,
            COALESCE(SUM(i.amount_paid),0)                  AS total_collected,
            COUNT(DISTINCT CASE WHEN i.status='paid' THEN i.id END)::int AS paid_count
     FROM users u
     LEFT JOIN invoices i ON i.created_by = u.id
       AND i.invoice_date BETWEEN $1 AND $2
       AND i.status NOT IN ('cancelled','draft')
     WHERE u.role IN ('admin','staff')
     GROUP BY u.id, u.name, u.role
     ORDER BY total_sales DESC`,
    [from, to]
  ).catch((err) => {
    dbError = err instanceof Error ? err.message : 'Database error';
    return null;
  });

  if (!res) {
    return (
      <div>
        <div className="page-header">
          <div>
            <nav className="text-sm text-gray-400 mb-1">
              <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Staff Performance
            </nav>
            <h1 className="page-title">Staff Performance</h1>
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Database Error</p>
          <p className="mt-1 font-mono text-xs text-red-600">{dbError}</p>
          <p className="mt-2 text-xs text-gray-500">Run the Phase 8 migration SQL to resolve missing columns or tables.</p>
        </div>
      </div>
    );
  }

  const rows = res.rows as Array<{
    id: string; name: string; role: string;
    invoice_count: number; total_sales: string;
    total_collected: string; paid_count: number;
  }>;

  const grandTotal   = rows.reduce((s, r) => s + Number(r.total_sales), 0);
  const grandInvoices = rows.reduce((s, r) => s + r.invoice_count, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <nav className="text-sm text-gray-400 mb-1">
            <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Staff Performance
          </nav>
          <h1 className="page-title">Staff Performance</h1>
          <p className="text-xs text-amber-600 mt-1">Admin only</p>
        </div>
        <a
          href={`/api/reports/staff?from=${from}&to=${to}`}
          className="btn-secondary text-sm"
        >
          Export CSV
        </a>
      </div>

      {/* Filters */}
      <form method="get" className="card mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <DatePicker name="from" defaultValue={from} className="input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <DatePicker name="to" defaultValue={to} className="input text-sm" />
          </div>
          <button type="submit" className="btn-primary text-sm">Apply</button>
        </div>
      </form>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Team Total Sales</p>
          <p className="text-xl font-bold text-purple-700">{formatInr(grandTotal)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Team Total Invoices</p>
          <p className="text-xl font-bold text-gray-800">{grandInvoices}</p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-400">No data in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Staff</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-right">Invoices</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Total Sales</th>
                <th className="px-4 py-3 text-right">Collected</th>
                <th className="px-4 py-3 text-right">AOV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 capitalize text-xs text-gray-500">{row.role}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.invoice_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-700">{row.paid_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-purple-700">
                    {formatInr(Number(row.total_sales))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-700">
                    {formatInr(Number(row.total_collected))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                    {row.invoice_count > 0
                      ? formatInr(Number(row.total_sales) / row.invoice_count)
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
