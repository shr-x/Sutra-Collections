import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import DuesRows from './dues-rows';

export const metadata: Metadata = { title: 'Outstanding Dues' };

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  payment_mode: string | null;
  balance_due: number;
  customer_id: string;
  customer_name: string;
  phone: string | null;
}

export default async function DuesPage({
  searchParams,
}: {
  searchParams: { warehouse?: string; days?: string };
}) {
  await requireRole('admin', 'accountant');

  const warehouseFilter = searchParams.warehouse ?? '';
  const daysFilter      = searchParams.days ?? ''; // '30' | '60' | '90' | ''

  const conditions: string[] = [
    `i.status IN ('issued','partially_paid')`,
    `i.grand_total > i.amount_paid`,
    `i.customer_id IS NOT NULL`,
  ];
  const params: unknown[] = [];

  if (warehouseFilter) { params.push(warehouseFilter); conditions.push(`i.warehouse_id = $${params.length}`); }
  if (daysFilter === '30')      conditions.push(`(CURRENT_DATE - COALESCE(i.due_date, (i.invoice_date + INTERVAL '30 days')::date)) BETWEEN 0 AND 30`);
  else if (daysFilter === '60') conditions.push(`(CURRENT_DATE - COALESCE(i.due_date, (i.invoice_date + INTERVAL '30 days')::date)) BETWEEN 31 AND 60`);
  else if (daysFilter === '90') conditions.push(`(CURRENT_DATE - COALESCE(i.due_date, (i.invoice_date + INTERVAL '30 days')::date)) > 90`);

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [invoicesRes, warehousesRes, summaryRes] = await Promise.all([
    pool.query<InvoiceRow>(
      `SELECT
         i.id, i.invoice_number, i.invoice_date::text, i.due_date::text, i.payment_mode,
         (i.grand_total - i.amount_paid)::numeric AS balance_due,
         c.id AS customer_id, c.name AS customer_name, c.phone
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       ${where}
       ORDER BY i.invoice_date ASC, i.invoice_number ASC`,
      params
    ),
    pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM warehouses ORDER BY name`
    ),
    pool.query<{ total: string; count: string; bucket_61_90: string; bucket_90_plus: string }>(
      `SELECT
         COALESCE(SUM(i.grand_total - i.amount_paid), 0) AS total,
         COUNT(DISTINCT i.customer_id) AS count,
         COALESCE(SUM(CASE WHEN (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days')::date) BETWEEN 61 AND 90
                           THEN i.grand_total - i.amount_paid ELSE 0 END), 0) AS bucket_61_90,
         COALESCE(SUM(CASE WHEN (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days')::date) > 90
                           THEN i.grand_total - i.amount_paid ELSE 0 END), 0) AS bucket_90_plus
       FROM invoices i ${where}`,
      params
    ),
  ]);

  const rows = invoicesRes.rows.map((r) => ({
    ...r,
    balance_due: Number(r.balance_due),
  }));

  const totalDue    = Number(summaryRes.rows[0]?.total ?? 0);
  const custCount   = Number(summaryRes.rows[0]?.count ?? 0);
  const bucket6190  = Number(summaryRes.rows[0]?.bucket_61_90 ?? 0);
  const bucket90p   = Number(summaryRes.rows[0]?.bucket_90_plus ?? 0);

  const csvParams = new URLSearchParams();
  if (warehouseFilter) csvParams.set('warehouse', warehouseFilter);
  if (daysFilter) csvParams.set('days', daysFilter);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Outstanding Dues</h1>
        <a href={`/api/customers/dues?${csvParams.toString()}`} className="btn-secondary">Export CSV</a>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          {/* Aging bucket quick-filter — fires immediately on tap */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-500">Overdue By</p>
            <div className="flex flex-wrap gap-1.5">
              {([
                { label: 'All', value: '' },
                { label: '30 Days', value: '30' },
                { label: '60 Days', value: '60' },
                { label: '90+ Days', value: '90' },
              ] as const).map((opt) => {
                const qs = new URLSearchParams();
                if (warehouseFilter) qs.set('warehouse', warehouseFilter);
                if (opt.value) qs.set('days', opt.value);
                const href = `/customers/dues${qs.toString() ? `?${qs.toString()}` : ''}`;
                return (
                  <Link
                    key={opt.value}
                    href={href}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      daysFilter === opt.value
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </Link>
                );
              })}
            </div>
          </div>
          {/* Warehouse — still needs explicit submit since it's a select */}
          <form method="GET" className="flex items-end gap-2">
            {daysFilter && <input type="hidden" name="days" value={daysFilter} />}
            <div className="min-w-[160px]">
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">Warehouse</label>
              <select name="warehouse" defaultValue={warehouseFilter}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500">
                <option value="">All warehouses</option>
                {warehousesRes.rows.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary btn-sm">Filter</button>
              {warehouseFilter && (
                <a href={`/customers/dues${daysFilter ? `?days=${daysFilter}` : ''}`} className="btn-ghost btn-sm">Clear</a>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Summary — same KPI card pattern as Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Outstanding',   value: formatInr(totalDue),  color: 'text-red-700',   grad: 'from-red-50 to-white',   ring: 'ring-red-100',   icon: '💰', iconBg: 'bg-red-100 text-red-700' },
          { label: 'Customers with Dues', value: String(custCount),     color: 'text-gray-800',  grad: 'from-gray-50 to-white',  ring: 'ring-gray-100',  icon: '👥', iconBg: 'bg-gray-100 text-gray-600' },
          { label: '60–90 Days',          value: formatInr(bucket6190), color: 'text-amber-700', grad: 'from-amber-50 to-white', ring: 'ring-amber-100', icon: '⏳', iconBg: 'bg-amber-100 text-amber-700' },
          { label: '90+ Days Critical',   value: formatInr(bucket90p),  color: 'text-red-800',   grad: 'from-red-50 to-white',   ring: 'ring-red-200',   icon: '🚨', iconBg: 'bg-red-200 text-red-800' },
        ].map((k) => (
          <div key={k.label} className={`rounded-2xl bg-gradient-to-br ${k.grad} p-4 shadow-sm ring-1 ${k.ring} transition-shadow hover:shadow-md`}>
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl text-lg ${k.iconBg}`}>{k.icon}</div>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="mt-0.5 text-xs font-medium text-gray-500">{k.label}</p>
          </div>
        ))}
      </div>

      <DuesRows rows={rows} totalDue={totalDue} />
    </div>
  );
}
