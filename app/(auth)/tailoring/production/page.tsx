import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import AssignTailorButton from './assign-tailor-button';
import StageButton from './stage-button';
import type { TailoringStage } from '@/types';

export const metadata: Metadata = { title: 'Production Board' };

interface OrderRow {
  id: string;
  order_number: string;
  stage: string;
  price: string;
  due_date: string | null;
  customer_name: string;
  design_name: string;
  color_fabric: string | null;
  tailor_id: string | null;
  tailor_name: string | null;
  batch_id: string | null;
  batch_size: number | null;
}

const COLUMNS: { stage: TailoringStage; label: string; hdr: string; border: string }[] = [
  { stage: 'placed',     label: 'Order Placed',     hdr: 'bg-blue-100 text-blue-800',     border: 'border-blue-200 bg-blue-50' },
  { stage: 'production', label: 'In Production',    hdr: 'bg-yellow-100 text-yellow-800', border: 'border-yellow-200 bg-yellow-50' },
  { stage: 'ready',      label: 'Ready for Pickup', hdr: 'bg-green-100 text-green-800',   border: 'border-green-200 bg-green-50' },
  { stage: 'delivered',  label: 'Delivered',         hdr: 'bg-gray-100 text-gray-600',     border: 'border-gray-200 bg-gray-50' },
];

const NEXT_STAGE: Partial<Record<TailoringStage, TailoringStage>> = {
  production: 'ready',
  ready:      'delivered',
};

const NEXT_LABEL: Partial<Record<TailoringStage, string>> = {
  production: '→ Ready',
  ready:      '→ Delivered',
};

export default async function ProductionBoardPage() {
  await requireRole('admin');

  const orderQuery = `
    SELECT o.id, o.order_number, o.stage, o.price::text, o.due_date::text,
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
      `${orderQuery} WHERE o.stage <> 'delivered' ORDER BY o.due_date ASC NULLS LAST, o.created_at ASC`
    ),
    query<OrderRow>(
      `${orderQuery} WHERE o.stage = 'delivered' ORDER BY o.updated_at DESC LIMIT 30`
    ),
  ]);

  const allOrders = [...res.rows, ...deliveredRes.rows];
  const byStage   = (s: TailoringStage) => allOrders.filter((o) => o.stage === s);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
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
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map(({ stage, label, hdr, border }) => {
          const orders    = byStage(stage);
          const nextStage = NEXT_STAGE[stage];
          return (
            <div
              key={stage}
              className={`flex flex-col overflow-hidden rounded-xl border ${border}`}
            >
              {/* Column header */}
              <div className={`flex shrink-0 items-center justify-between rounded-t-xl px-4 py-3 ${hdr}`}>
                <h2 className="text-sm font-semibold">{label}</h2>
                <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold">
                  {orders.length}
                </span>
              </div>

              {/* Scrollable cards */}
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {orders.length === 0 ? (
                  <p className="py-8 text-center text-xs text-gray-400">No orders</p>
                ) : (
                  orders.map((o) => {
                    const isOverdue =
                      o.due_date && new Date(o.due_date) < new Date() && stage !== 'delivered';
                    return (
                      <div
                        key={o.id}
                        className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              href={`/tailoring/${o.id}`}
                              className="font-mono text-xs font-bold leading-tight text-purple-700 hover:underline"
                            >
                              {o.order_number}
                            </Link>
                            {o.batch_size && (
                              <Link
                                href={`/tailoring/${o.id}`}
                                title={`Part of a batch of ${o.batch_size} orders`}
                                className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
                              >
                                🔗{o.batch_size}
                              </Link>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-gray-700 shrink-0">
                            {formatInr(Number(o.price))}
                          </span>
                        </div>

                        <div>
                          <p className="text-sm font-medium leading-tight text-gray-800">
                            {o.customer_name}
                          </p>
                          <p className="text-xs text-gray-500">{o.design_name}</p>
                          {o.color_fabric && (
                            <p className="text-xs italic text-gray-400">{o.color_fabric}</p>
                          )}
                        </div>

                        {o.due_date && (
                          <div
                            className={`text-xs ${
                              isOverdue ? 'font-semibold text-red-600' : 'text-gray-400'
                            }`}
                          >
                            {isOverdue ? '⚠ Overdue · ' : 'Due '}
                            {new Date(o.due_date).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </div>
                        )}

                        {/* Assign / change tailor — placed + production */}
                        {(stage === 'placed' || stage === 'production') && (
                          <AssignTailorButton
                            orderId={o.id}
                            currentTailorId={o.tailor_id}
                            currentTailorName={o.tailor_name}
                          />
                        )}

                        {/* Stage advance — production + ready only (placed goes via Assign Tailor) */}
                        {nextStage && (
                          <StageButton
                            orderId={o.id}
                            newStage={nextStage}
                            label={NEXT_LABEL[stage]!}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {stage === 'delivered' && deliveredRes.rows.length === 30 && (
                <div className="shrink-0 border-t px-4 py-2 text-center">
                  <Link href="/tailoring?stage=delivered" className="text-xs text-purple-600 hover:underline">
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
