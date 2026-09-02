import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';
import SalesChart from './sales-chart';

export const metadata: Metadata = { title: 'Sales Report' };

// Toggle between Combined (all invoices), Retail/Inventory (source='pos') and
// Tailoring (source='tailoring') — reuses the existing invoices.source column
// (db/migrations/008_invoice_source.sql) rather than any new report logic.
// State lives entirely in the URL (?mode=), same pattern as the existing
// from/to/warehouse_id/created_by filters — persists across navigation within
// the session, and (as a bonus, not a requirement) across reloads too.
type SalesMode = 'all' | 'retail' | 'tailoring';
const MODE_SOURCE: Record<Exclude<SalesMode, 'all'>, string> = { retail: 'pos', tailoring: 'tailoring' };
const MODE_LABEL: Record<SalesMode, string> = { all: 'All Sales', retail: 'Retail Sales', tailoring: 'Tailoring Sales' };

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; warehouse_id?: string; created_by?: string; mode?: string };
}) {
  await requireRole('admin', 'accountant');

  const today  = new Date().toISOString().slice(0, 10);
  const from   = searchParams.from ?? today.slice(0, 7) + '-01';
  const to     = searchParams.to   ?? today;
  const mode: SalesMode = searchParams.mode === 'retail' || searchParams.mode === 'tailoring' ? searchParams.mode : 'all';

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
  if (mode !== 'all') {
    params.push(MODE_SOURCE[mode]);
    conditions.push(`i.source=$${params.length}`);
  }

  const where = conditions.join(' AND ');

  // Preserves every other active filter when switching modes/building export links.
  const otherParams = new URLSearchParams();
  if (searchParams.warehouse_id) otherParams.set('warehouse_id', searchParams.warehouse_id);
  if (searchParams.created_by)   otherParams.set('created_by', searchParams.created_by);
  const otherQS = otherParams.toString() ? `&${otherParams.toString()}` : '';

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
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/reports/sales?from=${from}&to=${to}${otherQS}${mode !== 'all' ? '&mode=' + mode : ''}`}
            className="btn-secondary btn-sm"
          >
            Export CSV
          </a>
          <a
            href={`/api/reports/export/invoices?format=json`}
            className="btn-secondary btn-sm"
            download
          >
            Export JSON
          </a>
          <a
            href={`/api/reports/sales/pdf?from=${from}&to=${to}${searchParams.warehouse_id ? '&warehouse_id=' + searchParams.warehouse_id : ''}${mode !== 'all' ? '&mode=' + mode : ''}`}
            className="btn-secondary btn-sm"
            download
          >
            Export PDF
          </a>
        </div>
      </div>

      {/* Sales mode toggle — filters everything below (summary cards, chart, daily
          table) by invoices.source. State lives in the URL (?mode=), so it persists
          across navigation within the session (and reloads, as a free bonus) same as
          the from/to/warehouse/staff filters below. */}
      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        {(['all', 'retail', 'tailoring'] as const).map((m) => {
          const qs = new URLSearchParams();
          if (from) qs.set('from', from);
          if (to) qs.set('to', to);
          if (searchParams.warehouse_id) qs.set('warehouse_id', searchParams.warehouse_id);
          if (searchParams.created_by) qs.set('created_by', searchParams.created_by);
          if (m !== 'all') qs.set('mode', m);
          return (
            <Link
              key={m}
              href={`/reports/sales?${qs.toString()}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${mode === m ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {MODE_LABEL[m]}
            </Link>
          );
        })}
      </div>

      {/* Filters */}
      <form method="get" className="card mb-6">
        <input type="hidden" name="mode" value={mode === 'all' ? '' : mode} />
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
          <button type="submit" className="btn-primary btn-sm">Apply</button>
          <Link href="/reports/sales" className="btn-ghost btn-sm">Clear</Link>
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
