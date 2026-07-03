import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import SearchInput from '@/components/search-input';
import type { TailoringStage } from '@/types';

export const metadata: Metadata = { title: 'Tailoring Orders' };

const STAGE_BADGE: Record<TailoringStage, string> = {
  placed:     'bg-blue-100 text-blue-700',
  production: 'bg-yellow-100 text-yellow-700',
  ready:      'bg-green-100 text-green-700',
  delivered:  'bg-gray-100 text-gray-500',
};

const STAGE_LABEL: Record<TailoringStage, string> = {
  placed:     'Order Placed',
  production: 'In Production',
  ready:      'Ready for Pickup',
  delivered:  'Delivered',
};

export default async function TailoringOrdersPage({
  searchParams,
}: {
  searchParams: { q?: string; stage?: string };
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
  if (searchParams.stage) {
    params.push(searchParams.stage);
    conditions.push(`o.stage = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await query(
    `SELECT o.id, o.order_number, o.group_number, o.suffix, o.stage, o.price, o.due_date, o.created_at,
            c.name AS customer_name, c.phone AS customer_phone,
            d.name AS design_name, d.category AS design_category,
            o.color_fabric, o.batch_id,
            CASE WHEN o.batch_id IS NOT NULL THEN
              (SELECT COUNT(*)::int FROM tailoring_orders b WHERE b.batch_id = o.batch_id)
            ELSE NULL END AS batch_size
     FROM tailoring_orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN designs   d ON d.id = o.design_id
     ${where}
     ORDER BY o.created_at DESC
     LIMIT 200`,
    params
  );

  const stages: TailoringStage[] = ['placed', 'production', 'ready', 'delivered'];
  const rows = res.rows;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tailoring Orders</h1>
        <div className="flex gap-2">
          <Link href="/tailoring/production" className="btn-secondary">Production Board</Link>
          <Link href="/tailoring/new" className="btn-primary">+ New Order</Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search by order #, customer, design…" />
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/tailoring"
            className={`rounded-full px-3 py-1 text-xs font-medium ${!searchParams.stage ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </Link>
          {stages.map((s) => (
            <Link
              key={s}
              href={`/tailoring?stage=${s}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${searchParams.stage === s ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {STAGE_LABEL[s]}
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
                <th className="px-4 py-3 text-left whitespace-nowrap">Stage</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Price</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Due</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Date</th>
                <th className="px-4 py-3 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/tailoring/${row.id}`}
                      className="font-mono text-xs font-semibold text-purple-700 hover:underline"
                    >
                      {row.group_number ? `#${row.group_number}${row.suffix}` : row.order_number}
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
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_BADGE[row.stage as TailoringStage]}`}>
                      {STAGE_LABEL[row.stage as TailoringStage]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatInr(Number(row.price))}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {row.due_date
                      ? new Date(row.due_date).toLocaleDateString('en-IN')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/tailoring/${row.id}`} className="text-xs text-purple-600 hover:underline">
                      View →
                    </Link>
                  </td>
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
