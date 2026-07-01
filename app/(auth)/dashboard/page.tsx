import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { formatInr } from '@/lib/gst';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  await requireRole('admin');

  const today = new Date().toISOString().split('T')[0];

  // Fetch global low-stock threshold first so we can parameterise the queries below
  const thresholdRow = await pool.query<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'low_stock_threshold'`
  );
  const lowStockThreshold = Math.max(0, Number(thresholdRow.rows[0]?.value ?? 5));

  const [
    todaySalesRes,
    todayInvoiceRes,
    outstandingRes,
    lowStockRes,
    tailoringRes,
    recentInvoicesRes,
    lowStockItemsRes,
  ] = await Promise.all([
    // Today's total sales amount
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(grand_total),0)::numeric AS total
       FROM invoices WHERE invoice_date=$1 AND status NOT IN ('draft','cancelled')`,
      [today]
    ),
    // Today's invoice count
    pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM invoices WHERE invoice_date=$1 AND status != 'draft'`,
      [today]
    ),
    // Outstanding dues
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(grand_total - amount_paid),0)::numeric AS total
       FROM invoices WHERE status IN ('issued','partially_paid','overdue')`
    ),
    // Low stock count — global threshold, LEFT JOIN so zero-stock items are included
    pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM (
         SELECT i.id
         FROM items i
         LEFT JOIN stock s ON s.item_id = i.id
         WHERE i.is_active=TRUE AND i.item_type='finished'
         GROUP BY i.id
         HAVING COALESCE(SUM(s.quantity), 0) <= $1
       ) t`,
      [lowStockThreshold]
    ),
    // Active tailoring orders — graceful fallback if table doesn't exist
    pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM tailoring_orders WHERE stage NOT IN ('delivered','cancelled')`
    ).catch(() => ({ rows: [{ cnt: '0' }] })),
    // Recent 5 invoices
    pool.query<{
      id: string; invoice_number: string; invoice_date: string;
      grand_total: number; status: string; customer_name: string | null;
    }>(
      `SELECT i.id, i.invoice_number, i.invoice_date::text, i.grand_total::numeric, i.status,
              c.name AS customer_name
       FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
       WHERE i.status != 'draft'
       ORDER BY i.created_at DESC LIMIT 5`
    ),
    // Low stock items — global threshold, correlated subquery includes zero-stock items
    pool.query<{
      id: string; name: string; unit: string; quantity: number; warehouse_name: string;
    }>(
      `SELECT i.id, i.name, i.unit,
              COALESCE((SELECT SUM(s.quantity) FROM stock s WHERE s.item_id = i.id), 0)::numeric AS quantity,
              COALESCE(
                (SELECT w.name FROM stock s JOIN warehouses w ON w.id = s.warehouse_id
                 WHERE s.item_id = i.id ORDER BY s.quantity ASC LIMIT 1),
                'No stock'
              ) AS warehouse_name
       FROM items i
       WHERE i.is_active=TRUE AND i.item_type='finished'
         AND COALESCE((SELECT SUM(s.quantity) FROM stock s WHERE s.item_id = i.id), 0) <= $1
       ORDER BY quantity ASC
       LIMIT 8`,
      [lowStockThreshold]
    ),
  ]);

  const todaySales      = Number(todaySalesRes.rows[0]?.total ?? 0);
  const todayInvoices   = Number(todayInvoiceRes.rows[0]?.cnt ?? 0);
  const outstanding     = Number(outstandingRes.rows[0]?.total ?? 0);
  const lowStockCount   = Number(lowStockRes.rows[0]?.cnt ?? 0);
  const tailoringActive = Number(tailoringRes.rows[0]?.cnt ?? 0);

  const STATUS_BADGE: Record<string, string> = {
    draft:           'bg-gray-100 text-gray-500',
    issued:          'bg-orange-100 text-orange-700',
    paid:            'bg-green-600 text-white',
    partially_paid:  'bg-orange-100 text-orange-700',
    overdue:         'bg-red-100 text-red-700',
    cancelled:       'bg-red-600 text-white',
  };

  const kpis = [
    { label: "Today's Sales",    value: formatInr(todaySales),   color: 'text-green-700',  grad: 'from-green-50 to-white',  ring: 'ring-green-100',  icon: '₹',  iconBg: 'bg-green-100 text-green-700' },
    { label: "Today's Invoices", value: String(todayInvoices),   color: 'text-blue-700',   grad: 'from-blue-50 to-white',   ring: 'ring-blue-100',   icon: '🧾', iconBg: 'bg-blue-100 text-blue-700' },
    { label: 'Outstanding Dues', value: formatInr(outstanding),  color: 'text-red-700',    grad: 'from-red-50 to-white',    ring: 'ring-red-100',    icon: '⏳', iconBg: 'bg-red-100 text-red-700' },
    { label: 'Low Stock Items',  value: String(lowStockCount),   color: 'text-amber-700',  grad: 'from-amber-50 to-white',  ring: 'ring-amber-100',  icon: '📦', iconBg: 'bg-amber-100 text-amber-700' },
    { label: 'Active Tailoring', value: String(tailoringActive), color: 'text-purple-700', grad: 'from-purple-50 to-white', ring: 'ring-purple-100', icon: '✂️', iconBg: 'bg-purple-100 text-purple-700' },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm text-gray-400">{new Date(today).toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`rounded-2xl bg-gradient-to-br ${k.grad} p-4 shadow-sm ring-1 ${k.ring} transition-shadow hover:shadow-md`}
          >
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl text-lg ${k.iconBg}`}>
              {k.icon}
            </div>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="mt-0.5 text-xs font-medium text-gray-500">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2.5">
          {[
            { label: 'New Invoice',         href: '/billing/invoices/new',    icon: '🧾', accent: 'hover:border-blue-300 hover:bg-blue-50' },
            { label: 'New Customer',        href: '/customers/new',           icon: '👤', accent: 'hover:border-green-300 hover:bg-green-50' },
            { label: 'New Tailoring Order', href: '/tailoring/new',           icon: '✂️', accent: 'hover:border-purple-300 hover:bg-purple-50' },
            { label: 'Record Expense',      href: '/accounting/expenses/new', icon: '💸', accent: 'hover:border-red-300 hover:bg-red-50' },
            { label: 'New Purchase',        href: '/billing/purchases/new',   icon: '📥', accent: 'hover:border-amber-300 hover:bg-amber-50' },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={`inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors ${a.accent}`}
            >
              <span className="text-base leading-none">{a.icon}</span>
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent invoices */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Recent Invoices</h2>
            <Link href="/billing/invoices" className="text-xs text-purple-600 hover:underline">View all →</Link>
          </div>
          {recentInvoicesRes.rows.length === 0 ? (
            <div className="flex flex-col items-center px-4 pb-8 pt-4 text-center">
              <span className="text-3xl">🧾</span>
              <p className="mt-2 text-sm text-gray-400">No invoices yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {recentInvoicesRes.rows.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/billing/invoices/${inv.id}`} className="font-medium text-blue-600 hover:underline text-xs">
                        {inv.invoice_number}
                      </Link>
                      <p className="text-xs text-gray-400">{inv.customer_name ?? 'Walk-in'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">
                      {new Date(inv.invoice_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium text-gray-700">
                      {formatInr(Number(inv.grand_total))}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[inv.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {inv.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Low stock alerts */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Low Stock Alerts</h2>
            <Link href="/inventory/stock" className="text-xs text-purple-600 hover:underline">View stock →</Link>
          </div>
          {lowStockItemsRes.rows.length === 0 ? (
            <div className="flex flex-col items-center px-4 pb-8 pt-4 text-center">
              <span className="text-3xl">📦</span>
              <p className="mt-2 text-sm text-gray-400">All items are well-stocked</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {lowStockItemsRes.rows.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/inventory/items/${item.id}`} className="font-medium text-gray-800 hover:text-purple-600 text-xs">
                        {item.name}
                      </Link>
                      <p className="text-xs text-gray-400">{item.warehouse_name}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-xs font-semibold ${Number(item.quantity) <= 0 ? 'text-red-600' : 'text-orange-600'}`}>
                        {Number(item.quantity)} {item.unit}
                      </span>
                      <p className="text-xs text-gray-400">min: {lowStockThreshold}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
