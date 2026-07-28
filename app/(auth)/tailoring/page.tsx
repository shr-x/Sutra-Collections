import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import SearchInput from '@/components/search-input';
import type { TailoringStatus } from '@/types';

export const metadata: Metadata = { title: 'Tailoring Orders' };

const STATUS_BADGE: Record<TailoringStatus, string> = {
  in_progress:      'bg-amber-100 text-amber-700',
  ready_for_pickup: 'bg-green-100 text-green-700',
  picked_up:        'bg-blue-100 text-blue-700',
  delivered:        'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<TailoringStatus, string> = {
  in_progress:      'In Progress',
  ready_for_pickup: 'Ready for Pickup',
  picked_up:        'Picked Up',
  delivered:        'Delivered',
};

type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'credit';

const PAYMENT_BADGE: Record<PaymentStatus, string> = {
  unpaid:  'bg-red-100 text-red-700',
  partial: 'bg-yellow-100 text-yellow-700',
  paid:    'bg-green-100 text-green-700',
  credit:  'bg-purple-100 text-purple-700',
};

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid:  'Unpaid',
  partial: 'Partially Paid',
  paid:    'Fully Paid',
  credit:  'On Credit',
};

export default async function TailoringOrdersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; payment?: string };
}) {
  await requireRole('admin', 'staff');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (searchParams.q) {
    params.push(`%${searchParams.q.trim()}%`);
    conditions.push(
      `(o.order_number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR d.name ILIKE $${params.length})`
    );
  }
  if (searchParams.status) {
    params.push(searchParams.status);
    conditions.push(`o.status = $${params.length}`);
  }
  if (searchParams.payment) {
    conditions.push(
      searchParams.payment === 'credit'    ? `o.credit_amount > 0` :
      searchParams.payment === 'unpaid'    ? `o.credit_amount = 0 AND o.amount_paid <= 0` :
      searchParams.payment === 'partial'   ? `o.credit_amount = 0 AND o.amount_paid > 0 AND o.amount_paid < o.total_amount` :
      /* paid */                              `o.credit_amount = 0 AND o.amount_paid >= o.total_amount`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await query(
    `SELECT o.id, o.order_number, o.group_number, o.suffix, o.status,
            o.total_amount, o.amount_paid, o.credit_amount, o.due_date, o.created_at,
            c.name AS customer_name, c.phone AS customer_phone,
            d.name AS design_name, d.category AS design_category,
            o.color_fabric, o.batch_id,
            CASE WHEN o.batch_id IS NOT NULL THEN
              (SELECT COUNT(*)::int FROM tailoring_orders b WHERE b.batch_id = o.batch_id)
            ELSE NULL END AS batch_size,
            CASE
              WHEN o.credit_amount > 0 THEN 'credit'
              WHEN o.amount_paid <= 0 THEN 'unpaid'
              WHEN o.amount_paid < o.total_amount THEN 'partial'
              ELSE 'paid'
            END AS payment_status
     FROM tailoring_orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN designs   d ON d.id = o.design_id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT 200`,
    params
  );

  const statuses: TailoringStatus[] = ['in_progress', 'ready_for_pickup', 'picked_up', 'delivered'];
  const paymentStatuses: PaymentStatus[] = ['unpaid', 'partial', 'paid', 'credit'];
  const rows = res.rows;

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (searchParams.q) p.set('q', searchParams.q);
    if (searchParams.status) p.set('status', searchParams.status);
    if (searchParams.payment) p.set('payment', searchParams.payment);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) p.delete(k); else p.set(k, v);
    }
    const s = p.toString();
    return s ? `/tailoring?${s}` : '/tailoring';
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tailoring Orders</h1>
        <div className="flex gap-2">
          <Link href="/tailoring/production" className="btn-secondary">Production Board</Link>
          <Link href="/tailoring/new" className="btn-primary">+ New Order</Link>
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <SearchInput placeholder="Search by order #, customer, design…" />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-gray-400">Status:</span>
          <Link
            href={qs({ status: undefined })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${!searchParams.status ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </Link>
          {statuses.map((s) => (
            <Link
              key={s}
              href={qs({ status: s })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${searchParams.status === s ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {STATUS_LABEL[s]}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-gray-400">Payment:</span>
          <Link
            href={qs({ payment: undefined })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${!searchParams.payment ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </Link>
          {paymentStatuses.map((p) => (
            <Link
              key={p}
              href={qs({ payment: p })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${searchParams.payment === p ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {PAYMENT_LABEL[p]}
            </Link>
          ))}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            No orders found.{' '}
            <Link href="/tailoring/new" className="text-purple-600 underline">Create one →</Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">Order #</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Customer</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Design</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Payment</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Total</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Balance</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Due</th>
                <th className="px-4 py-3 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const total   = Number(row.total_amount);
                const paid    = Number(row.amount_paid);
                const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
                const payStatus = row.payment_status as PaymentStatus;
                return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/tailoring/${row.id}`}
                      className="font-mono text-xs font-semibold text-purple-700 hover:underline"
                    >
                      {row.order_number}
                    </Link>
                    {row.batch_size && (
                      <Link
                        href={`/tailoring/${row.id}`}
                        title="Part of a batch booking"
                        className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
                      >
                        🔗{row.batch_size}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.customer_name}</div>
                    {row.customer_phone && (
                      <div className="text-xs text-gray-400">{row.customer_phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>{row.design_name}</div>
                    {row.design_category && (
                      <div className="text-xs text-gray-400">{row.design_category}</div>
                    )}
                    {row.color_fabric && (
                      <div className="text-xs text-gray-500 italic">{row.color_fabric}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status as TailoringStatus]}`}>
                      {STATUS_LABEL[row.status as TailoringStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_BADGE[payStatus]}`}>
                      {PAYMENT_LABEL[payStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatInr(total)}</td>
                  <td className={`px-4 py-3 text-right whitespace-nowrap ${balance > 0 ? 'font-medium text-red-700' : 'text-gray-400'}`}>
                    {balance > 0 ? formatInr(balance) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {row.due_date
                      ? new Date(row.due_date).toLocaleDateString('en-IN')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/tailoring/${row.id}`} className="text-xs text-purple-600 hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
