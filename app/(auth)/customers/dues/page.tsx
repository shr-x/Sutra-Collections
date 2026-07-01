import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import { recordPaymentAction } from '@/app/(auth)/billing/invoices/actions';
import CollectPaymentModal from '@/components/collect-payment-modal';
import DatePicker from '@/components/date-picker';

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
  searchParams: { warehouse?: string; from?: string; to?: string };
}) {
  await requireRole('admin', 'accountant');

  const warehouseFilter = searchParams.warehouse ?? '';
  const fromFilter      = searchParams.from ?? '';
  const toFilter        = searchParams.to ?? '';
  const today = new Date().toISOString().slice(0, 10);

  const conditions: string[] = [
    `i.status IN ('issued','partially_paid')`,
    `i.grand_total > i.amount_paid`,
    `i.customer_id IS NOT NULL`,
  ];
  const params: unknown[] = [];

  if (warehouseFilter) { params.push(warehouseFilter); conditions.push(`i.warehouse_id = $${params.length}`); }
  if (fromFilter)      { params.push(fromFilter);      conditions.push(`i.invoice_date >= $${params.length}`); }
  if (toFilter)        { params.push(toFilter);        conditions.push(`i.invoice_date <= $${params.length}`); }

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
  if (fromFilter) csvParams.set('from', fromFilter);
  if (toFilter) csvParams.set('to', toFilter);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Outstanding Dues</h1>
        <a href={`/api/customers/dues?${csvParams.toString()}`} className="btn-secondary">Export CSV</a>
      </div>

      {/* Filters */}
      <form method="GET" className="mb-4 rounded-xl bg-white shadow-sm p-6 flex flex-wrap gap-6 items-end">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">Warehouse</label>
          <select name="warehouse" defaultValue={warehouseFilter}
            className="form-input min-w-[180px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            <option value="">All warehouses</option>
            {warehousesRes.rows.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">From</label>
          <DatePicker name="from" defaultValue={fromFilter || today} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">To</label>
          <DatePicker name="to" defaultValue={toFilter || today} />
        </div>
        <div className="flex items-end gap-3">
          <button type="submit"
            className="rounded-full bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 transition-colors">
            Filter
          </button>
          {(warehouseFilter || fromFilter || toFilter) && (
            <a href="/customers/dues" className="text-sm text-gray-500 hover:underline pb-0.5">Clear</a>
          )}
        </div>
      </form>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-2xl border-l-4 border-red-400 bg-red-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-red-600">💰 Total Outstanding</p>
          <p className="text-xl font-bold text-red-700 mt-1">{formatInr(totalDue)}</p>
        </div>
        <div className="rounded-2xl border-l-4 border-gray-300 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">👥 Customers with Dues</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{custCount}</p>
        </div>
        <div className="rounded-2xl border-l-4 border-yellow-400 bg-yellow-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-yellow-700">⏳ 60–90 Days</p>
          <p className="text-xl font-bold text-yellow-800 mt-1">{formatInr(bucket6190)}</p>
        </div>
        <div className="rounded-2xl border-l-4 border-red-600 bg-red-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-red-700">🚨 90+ Days (Critical)</p>
          <p className="text-xl font-bold text-red-800 mt-1">{formatInr(bucket90p)}</p>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Invoice</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Mode</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-red-700">Balance Due</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center">
                <span className="text-4xl">🎉</span>
                <p className="mt-2 text-sm font-medium text-gray-500">All dues are cleared!</p>
              </td></tr>
            )}
            {rows.map((row) => {
              const payAction = recordPaymentAction.bind(null, row.id);
              return (
                <tr key={row.id} className="even:bg-gray-50/60 hover:bg-purple-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${row.customer_id}`}
                      className="font-medium text-purple-700 hover:underline">
                      {row.customer_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{row.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/billing/invoices/${row.id}`}
                      className="font-mono text-xs text-purple-600 hover:underline">
                      {row.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {new Date(row.invoice_date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs capitalize">
                    {row.payment_mode ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-700">
                    {formatInr(row.balance_due)}
                  </td>
                  <td className="px-4 py-3">
                    <CollectPaymentModal
                      balance={row.balance_due}
                      action={payAction}
                      invoiceNumber={row.invoice_number}
                      customerName={row.customer_name}
                      returnTo="/customers/dues"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-sm">
                  {rows.length} invoice{rows.length !== 1 ? 's' : ''}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-red-700">{formatInr(totalDue)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
