import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';

export const metadata: Metadata = { title: 'Customer Dues' };

interface DueRow {
  order_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  credit_amount: string;
  credited_at: string | null;
  status: string;
}

export default async function CustomerDuesReportPage() {
  await requireRole('admin', 'accountant');

  const res = await query<DueRow>(
    `SELECT o.id AS order_id, o.order_number, c.id AS customer_id, c.name AS customer_name,
            c.phone AS customer_phone, o.credit_amount::text, o.credited_at::text, o.status
     FROM tailoring_orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.credit_amount > 0
     ORDER BY o.credited_at DESC NULLS LAST`
  );

  const rows = res.rows;
  const total = rows.reduce((sum, r) => sum + Number(r.credit_amount), 0);

  // Grouped by customer for a quick per-customer subtotal.
  const byCustomer = new Map<string, { name: string; phone: string | null; total: number }>();
  for (const r of rows) {
    const existing = byCustomer.get(r.customer_id);
    const amount = Number(r.credit_amount);
    if (existing) existing.total += amount;
    else byCustomer.set(r.customer_id, { name: r.customer_name, phone: r.customer_phone, total: amount });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <nav className="text-sm text-gray-400 mb-1">
            <Link href="/reports" className="hover:text-gray-600">Reports</Link> / Customer Dues
          </nav>
          <h1 className="page-title">Customer Dues</h1>
          <p className="mt-1 text-xs text-gray-500">
            Tailoring orders delivered on credit — balance pushed to the customer's outstanding dues.
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Total Outstanding (Tailoring Credit)</p>
          <p className="text-2xl font-bold text-amber-700">{formatInr(total)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Customers with Dues</p>
          <p className="text-2xl font-bold text-gray-800">{byCustomer.size}</p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">No outstanding tailoring dues.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Customer</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Order</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Order Status</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Amount Due</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.order_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${r.customer_id}`} className="font-medium text-purple-700 hover:underline">
                        {r.customer_name}
                      </Link>
                      {r.customer_phone && <div className="text-xs text-gray-400">{r.customer_phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/tailoring/${r.order_id}`} className="font-mono text-xs text-purple-700 hover:underline">
                        {r.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 capitalize">{r.status.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-700 whitespace-nowrap">
                      {formatInr(Number(r.credit_amount))}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {r.credited_at ? new Date(r.credited_at).toLocaleDateString('en-IN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-300 bg-amber-50">
                <tr className="font-semibold text-amber-800">
                  <td colSpan={3} className="px-4 py-3 text-sm">Total</td>
                  <td className="px-4 py-3 text-right">{formatInr(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
