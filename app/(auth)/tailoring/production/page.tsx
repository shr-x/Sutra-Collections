import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import ProductionColumn, { type OrderRow, type ColumnKey } from './production-column';

export const metadata: Metadata = { title: 'Production Board' };

// Board columns are a DISPLAY split, not a new status — "Unassigned" vs
// "In Production" are both status='in_progress', split purely on tailor_id.

function columnOf(o: OrderRow): ColumnKey {
  if (o.status === 'delivered') return 'delivered';
  if (o.status === 'ready_for_pickup') return 'ready_for_pickup';
  return o.tailor_id ? 'in_production' : 'unassigned';
}

const COLUMNS: { key: ColumnKey; label: string; hdr: string; border: string }[] = [
  { key: 'unassigned',       label: 'Unassigned',       hdr: 'bg-red-100 text-red-800',      border: 'border-red-200 bg-red-50' },
  { key: 'in_production',    label: 'In Production',    hdr: 'bg-amber-100 text-amber-800',  border: 'border-amber-200 bg-amber-50' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup', hdr: 'bg-green-100 text-green-800',  border: 'border-green-200 bg-green-50' },
  { key: 'delivered',        label: 'Delivered',        hdr: 'bg-gray-100 text-gray-600',    border: 'border-gray-200 bg-gray-50' },
];

export default async function ProductionBoardPage() {
  await requireRole('admin');

  const orderQuery = `
    SELECT o.id, o.order_number, o.group_number, o.suffix, o.status,
           o.total_amount::text, o.amount_paid::text, o.due_date::text,
           o.customer_id,
           COALESCE(o.customer_name_snapshot, c.name, 'Unknown') AS customer_name,
           d.name AS design_name,
           o.color_fabric,
           o.tailor_id,
           t.name AS tailor_name,
           o.batch_id,
           CASE WHEN o.batch_id IS NOT NULL THEN
             (SELECT COUNT(*)::int FROM tailoring_orders b WHERE b.batch_id = o.batch_id)
           ELSE NULL END AS batch_size
    FROM tailoring_orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    JOIN designs   d ON d.id = o.design_id
    LEFT JOIN tailors t ON t.id = o.tailor_id
  `;

  const [res, deliveredRes] = await Promise.all([
    query<OrderRow>(
      `${orderQuery} WHERE o.status <> 'delivered' ORDER BY o.due_date ASC NULLS LAST, o.created_at ASC`
    ),
    query<OrderRow>(
      `${orderQuery} WHERE o.status = 'delivered' ORDER BY o.updated_at DESC LIMIT 30`
    ),
  ]);

  const allOrders = [...res.rows, ...deliveredRes.rows];
  const byColumn = (key: ColumnKey) => allOrders.filter((o) => columnOf(o) === key);

  return (
    <div className="md:flex md:flex-col md:h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="page-header shrink-0">
        <div>
          <Link href="/tailoring" className="text-sm text-purple-600 hover:underline">
            ← Tailoring Orders
          </Link>
          <h1 className="page-title mt-1">Production Board</h1>
        </div>
        <Link href="/tailoring/new" className="btn-primary">+ New Order</Link>
      </div>

      {/* Board — fixed height, 4 scrollable columns */}
      <div className="grid min-h-0 md:flex-1 grid-cols-1 gap-3 md:overflow-hidden md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map(({ key, label, hdr, border }) => {
          const orders = byColumn(key);
          return (
            <div
              key={key}
              className={`flex flex-col md:overflow-hidden rounded-xl border ${border}`}
            >
              {/* Column header */}
              <div className={`flex shrink-0 items-center justify-between rounded-t-xl px-4 py-3 ${hdr}`}>
                <h2 className="text-sm font-semibold">{label}</h2>
                <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold">
                  {orders.length}
                </span>
              </div>

              {/* Scrollable cards */}
              <div className="flex-1 space-y-3 md:overflow-y-auto p-3">
                <ProductionColumn columnKey={key} orders={orders} />
              </div>

              {key === 'delivered' && deliveredRes.rows.length === 30 && (
                <div className="shrink-0 border-t px-4 py-2 text-center">
                  <Link href="/tailoring?status=delivered" className="text-xs text-purple-600 hover:underline">
                    View all delivered →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
