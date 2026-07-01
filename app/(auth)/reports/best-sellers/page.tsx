import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'Best Sellers' };

export default async function BestSellersPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; warehouse_id?: string; sort?: string };
}) {
  await requireRole('admin', 'accountant');

  const today = new Date().toISOString().slice(0, 10);
  const from  = searchParams.from ?? today.slice(0, 7) + '-01';
  const to    = searchParams.to   ?? today;
  const sort  = searchParams.sort === 'revenue' ? 'revenue' : 'qty';

  const conditions = [
    `i.invoice_date BETWEEN $1 AND $2`,
    `i.status NOT IN ('cancelled','draft')`,
  ];
  const params: unknown[] = [from, to];

  if (searchParams.warehouse_id) {
    params.push(searchParams.warehouse_id);
    conditions.push(`i.warehouse_id=$${params.length}`);
  }

  const where = conditions.join(' AND ');

  let dbError: string | null = null;
  const rawData = await Promise.all([
    // items table has no category column — use NULL so the display still works once added
    query(
      `SELECT it.id, it.name AS item_name,
              NULL::text AS category, it.item_type,
              SUM(ii.quantity)::numeric                        AS total_qty,
              SUM(ii.total_amount)                             AS total_revenue,
              SUM(ii.cgst_amount + ii.sgst_amount)            AS total_gst,
              COUNT(DISTINCT i.id)::int                        AS invoice_count
       FROM invoice_items ii
       JOIN invoices i  ON i.id = ii.invoice_id
       JOIN items    it ON it.id = ii.item_id
       WHERE ${where}
       GROUP BY it.id, it.name, it.item_type
       ORDER BY ${sort === 'revenue' ? 'total_revenue' : 'total_qty'} DESC
       LIMIT 50`,
      params
    ),
    query('SELECT id, name FROM warehouses ORDER BY name'),
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
              <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Best Sellers
            </nav>
            <h1 className="page-title">Best Sellers</h1>
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

  const [itemsRes, warehousesRes] = rawData;

  const rows = itemsRes.rows as Array<{
    id: string;
    item_name: string;
    category: string | null;
    item_type: string;
    total_qty: string;
    total_revenue: string;
    total_gst: string;
    invoice_count: number;
  }>;

  return (
    <div>
      <div className="page-header">
        <div>
          <nav className="text-sm text-gray-400 mb-1">
            <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Best Sellers
          </nav>
          <h1 className="page-title">Best Sellers</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href={`/api/reports/best-sellers?from=${from}&to=${to}${searchParams.warehouse_id ? '&warehouse_id=' + searchParams.warehouse_id : ''}&sort=${sort}`}
            className="btn-secondary text-sm min-h-[44px]"
          >
            Export CSV
          </a>
          <a
            href={`/api/reports/best-sellers/pdf?from=${from}&to=${to}${searchParams.warehouse_id ? '&warehouse_id=' + searchParams.warehouse_id : ''}&sort=${sort}`}
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Sort By</label>
            <select name="sort" className="input text-sm">
              <option value="qty"     selected={sort === 'qty'}>Qty Sold</option>
              <option value="revenue" selected={sort === 'revenue'}>Revenue</option>
            </select>
          </div>
          <button type="submit" className="btn-primary text-sm">Apply</button>
          <Link href="/reports/best-sellers" className="text-sm text-gray-500 hover:underline">Clear</Link>
        </div>
      </form>

      <div className="card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-400">No sales data in this period.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">#</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Item</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Qty Sold</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Revenue</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">GST</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Invoices</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">{i + 1}</td>
                  <td className="px-4 py-2">
                    <Link href={`/inventory/items/${row.id}`} className="font-medium text-purple-700 hover:underline">
                      {row.item_name}
                    </Link>
                    {row.category && <div className="text-xs text-gray-400">{row.category}</div>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold whitespace-nowrap">
                    {parseFloat(row.total_qty).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-purple-700 whitespace-nowrap">
                    {formatInr(Number(row.total_revenue))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500 whitespace-nowrap">
                    {formatInr(Number(row.total_gst))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{row.invoice_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
