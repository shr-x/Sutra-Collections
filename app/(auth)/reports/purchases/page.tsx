import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'Purchase Report' };

export default async function PurchaseReportPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; supplier_id?: string };
}) {
  await requireRole('admin', 'accountant');

  const today = new Date().toISOString().slice(0, 10);
  const from  = searchParams.from ?? today.slice(0, 7) + '-01';
  const to    = searchParams.to   ?? today;

  // purchase_invoices uses purchase_date (not invoice_date)
  const conditions = [`p.purchase_date BETWEEN $1 AND $2`];
  const params: unknown[] = [from, to];

  if (searchParams.supplier_id) {
    params.push(searchParams.supplier_id);
    conditions.push(`p.supplier_id=$${params.length}`);
  }

  const where = conditions.join(' AND ');

  let dbError: string | null = null;
  const rawData = await Promise.all([
    query(
      `SELECT COUNT(*)::int                                          AS invoice_count,
              COALESCE(SUM(p.grand_total),0)                        AS total_purchases,
              COALESCE(SUM(p.total_cgst + p.total_sgst),0)         AS total_itc,
              COALESCE(SUM(p.amount_paid),0)                        AS total_paid
       FROM purchase_invoices p WHERE ${where}`,
      params
    ),
    query(
      `SELECT s.name AS supplier_name,
              COUNT(p.id)::int       AS invoice_count,
              SUM(p.grand_total)     AS total,
              SUM(p.total_cgst + p.total_sgst) AS itc
       FROM purchase_invoices p
       LEFT JOIN suppliers s ON s.id=p.supplier_id
       WHERE ${where}
       GROUP BY s.id, s.name ORDER BY total DESC`,
      params
    ),
    query('SELECT id, name FROM suppliers ORDER BY name'),
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
              <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Purchases
            </nav>
            <h1 className="page-title">Purchase Report</h1>
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

  const [summaryRes, bySupplierRes, suppliersRes] = rawData;
  const s = summaryRes.rows[0];

  return (
    <div>
      <div className="page-header">
        <div>
          <nav className="text-sm text-gray-400 mb-1">
            <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Purchases
          </nav>
          <h1 className="page-title">Purchase Report</h1>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/reports/purchases?from=${from}&to=${to}${searchParams.supplier_id ? '&supplier_id=' + searchParams.supplier_id : ''}`}
            className="btn-secondary btn-sm"
          >
            Export CSV
          </a>
          <a
            href={`/api/reports/purchases/pdf?from=${from}&to=${to}${searchParams.supplier_id ? '&supplier_id=' + searchParams.supplier_id : ''}`}
            className="btn-secondary btn-sm"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
            <select name="supplier_id" className="input text-sm">
              <option value="">All Suppliers</option>
              {(suppliersRes.rows as Array<{ id: string; name: string }>).map((s) => (
                <option key={s.id} value={s.id} selected={searchParams.supplier_id === s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary btn-sm">Apply</button>
          <Link href="/reports/purchases" className="btn-ghost btn-sm">Clear</Link>
        </div>
      </form>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        {[
          { label: 'Total Purchases', value: formatInr(Number(s.total_purchases)), color: 'text-purple-700' },
          { label: 'ITC Claimable',   value: formatInr(Number(s.total_itc)),       color: 'text-blue-700'   },
          { label: 'Total Paid',      value: formatInr(Number(s.total_paid)),      color: 'text-green-700'  },
          { label: 'Invoices',        value: String(Number(s.invoice_count)),       color: 'text-gray-800'   },
        ].map((card) => (
          <div key={card.label} className="card text-center">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* By supplier */}
      {bySupplierRes.rows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">By Supplier</h2>
          </div>
          {/* Mobile: stacked supplier cards */}
          <div className="sm:hidden divide-y divide-gray-100">
            {(bySupplierRes.rows as Array<{ supplier_name: string | null; invoice_count: number; total: string; itc: string }>).map((r, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm">{r.supplier_name ?? '—'}</span>
                  <span className="text-xs text-gray-500">{r.invoice_count} inv</span>
                </div>
                <div className="flex gap-4 text-xs">
                  <div><span className="text-gray-400">Total </span><span className="font-semibold">{formatInr(Number(r.total))}</span></div>
                  <div><span className="text-gray-400">ITC </span><span className="text-blue-700">{formatInr(Number(r.itc))}</span></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-right">Invoices</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">ITC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(bySupplierRes.rows as Array<{ supplier_name: string | null; invoice_count: number; total: string; itc: string }>).map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{r.supplier_name ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.invoice_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatInr(Number(r.total))}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-blue-700">{formatInr(Number(r.itc))}</td>
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
