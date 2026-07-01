import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';
import SalesChart from './sales-chart';

export const metadata: Metadata = { title: 'Sales Report' };

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; warehouse_id?: string; created_by?: string };
}) {
  await requireRole('admin', 'accountant');

  const today  = new Date().toISOString().slice(0, 10);
  const from   = searchParams.from ?? today.slice(0, 7) + '-01';
  const to     = searchParams.to   ?? today;

  const conditions = [
    `i.invoice_date BETWEEN $1 AND $2`,
    `i.status NOT IN ('cancelled','draft')`,
  ];
  const params: unknown[] = [from, to];

  if (searchParams.warehouse_id) {
    params.push(searchParams.warehouse_id);
    conditions.push(`i.warehouse_id=$${params.length}`);
  }
  if (searchParams.created_by) {
    params.push(searchParams.created_by);
    conditions.push(`i.created_by=$${params.length}`);
  }

  const where = conditions.join(' AND ');

  let dbError: string | null = null;
  const rawData = await Promise.all([
    query(
      `SELECT COUNT(*)::int                                   AS invoice_count,
              COALESCE(SUM(i.grand_total),0)                 AS total_sales,
              COALESCE(SUM(i.total_cgst + i.total_sgst),0)  AS total_gst,
              COALESCE(SUM(i.invoice_discount_amount),0)     AS total_discounts,
              COALESCE(SUM(i.amount_paid),0)                 AS total_collected
       FROM invoices i WHERE ${where}`,
      params
    ),
    query(
      `SELECT i.invoice_date::text AS day,
              COUNT(*)::int        AS count,
              SUM(i.grand_total)   AS total
       FROM invoices i
       WHERE ${where}
       GROUP BY i.invoice_date ORDER BY i.invoice_date`,
      params
    ),
    query('SELECT id, name FROM warehouses ORDER BY name'),
    query(`SELECT id, name FROM users WHERE role IN ('admin','staff') ORDER BY name`),
  ]).catch((err) => {
    dbError = err instanceof Error ? err.message : 'Database error';
    return null;
  });

  if (!rawData) {
    return (
      <div>
        <div className="page-header">
          <div>
            <nav className="text-sm text-gray-400 mb-1">
              <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Sales
            </nav>
            <h1 className="page-title">Sales Report</h1>
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

  const [summaryRes, dailyRes, warehousesRes, usersRes] = rawData;
  const s           = summaryRes.rows[0];
  const dailyRows   = dailyRes.rows as Array<{ day: string; count: number; total: string }>;

  return (
    <div>
      <div className="page-header">
        <div>
          <nav className="text-sm text-gray-400 mb-1">
            <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Sales
          </nav>
          <h1 className="page-title">Sales Report</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href={`/api/reports/sales?from=${from}&to=${to}${searchParams.warehouse_id ? '&warehouse_id=' + searchParams.warehouse_id : ''}${searchParams.created_by ? '&created_by=' + searchParams.created_by : ''}`}
            className="btn-secondary text-sm min-h-[44px]"
          >
            Export CSV
          </a>
          <a
            href={`/api/reports/export/invoices?format=json`}
            className="btn-secondary text-sm min-h-[44px]"
            download
          >
            Export JSON
          </a>
          <a
            href={`/api/reports/sales/pdf?from=${from}&to=${to}${searchParams.warehouse_id ? '&warehouse_id=' + searchParams.warehouse_id : ''}`}
            className="btn-secondary text-sm min-h-[44px]"
            download
          >
            Export PDF
          </a>
        </div>
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Warehouse</label>
            <select name="warehouse_id" className="input text-sm">
              <option value="">All Warehouses</option>
              {(warehousesRes.rows as Array<{ id: string; name: string }>).map((w) => (
                <option key={w.id} value={w.id} selected={searchParams.warehouse_id === w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Staff</label>
            <select name="created_by" className="input text-sm">
              <option value="">All Staff</option>
              {(usersRes.rows as Array<{ id: string; name: string }>).map((u) => (
                <option key={u.id} value={u.id} selected={searchParams.created_by === u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary text-sm">Apply</button>
          <Link href="/reports/sales" className="text-sm text-gray-500 hover:underline">Clear</Link>
        </div>
      </form>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        {[
          { label: 'Total Sales',      value: formatInr(Number(s.total_sales)),      color: 'text-purple-700' },
          { label: 'GST Collected',    value: formatInr(Number(s.total_gst)),         color: 'text-blue-700' },
          { label: 'Discounts Given',  value: formatInr(Number(s.total_discounts)),   color: 'text-red-600' },
          { label: 'Cash Collected',   value: formatInr(Number(s.total_collected)),   color: 'text-green-700' },
        ].map((card) => (
          <div key={card.label} className="card text-center">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>
      <div className="card mb-6 text-center py-3">
        <span className="text-sm text-gray-500">Total Invoices: </span>
        <span className="font-bold text-gray-800">{Number(s.invoice_count)}</span>
        {Number(s.invoice_count) > 0 && (
          <>
            <span className="mx-3 text-gray-300">|</span>
            <span className="text-sm text-gray-500">Average Order Value: </span>
            <span className="font-bold text-gray-800">
              {formatInr(Number(s.total_sales) / Number(s.invoice_count))}
            </span>
          </>
        )}
      </div>

      {/* Daily trend bar chart */}
      {dailyRows.length > 0 && (
        <div className="card mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Daily Sales Trend</h2>
          <SalesChart data={dailyRows} />
        </div>
      )}

      {/* Daily breakdown table */}
      {dailyRows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Invoices</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Total Sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dailyRows.map((r) => (
                <tr key={r.day} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Link href={`/reports/daybook?date=${r.day}`} className="text-purple-700 hover:underline">
                      {new Date(r.day + 'T00:00:00').toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap">{formatInr(Number(r.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
