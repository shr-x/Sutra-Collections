import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import AssignTailorButton from './assign-tailor-button';
import StageButton from './stage-button';
import RecordPaymentButton from '../[id]/record-payment-button';
import RequestAlterationButton from '../[id]/request-alteration-button';
import DeliveryActions from '../[id]/delivery-actions';
import type { TailoringStatus } from '@/types';

export const metadata: Metadata = { title: 'Production Board' };

interface OrderRow {
  id: string;
  order_number: string;
  group_number: string | null;
  suffix: string | null;
  status: TailoringStatus;
  total_amount: string;
  amount_paid: string;
  due_date: string | null;
  customer_name: string;
  design_name: string;
  color_fabric: string | null;
  tailor_id: string | null;
  tailor_name: string | null;
  batch_id: string | null;
  batch_size: number | null;
}

// Board columns are a DISPLAY split, not a new status — "Unassigned" vs
// "In Production" are both status='in_progress', split purely on tailor_id.
type ColumnKey = 'unassigned' | 'in_production' | 'ready_for_pickup' | 'delivered';

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
                {orders.length === 0 ? (
                  <p className="py-8 text-center text-xs text-gray-400">No orders</p>
                ) : (
                  orders.map((o) => {
                    const total     = Number(o.total_amount);
                    const paid      = Number(o.amount_paid);
                    const balance   = Math.max(0, Math.round((total - paid) * 100) / 100);
                    const isOverdue = o.due_date && new Date(o.due_date) < new Date() && key !== 'delivered';
                    return (
                      <div
                        key={o.id}
                        className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
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
                            {formatInr(total)}
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

                        {/* ── Unassigned: assign a tailor + optional payment ── */}
                        {key === 'unassigned' && (
                          <>
                            <AssignTailorButton
                              orderId={o.id}
                              currentTailorId={o.tailor_id}
                              currentTailorName={o.tailor_name}
                            />
                            <RecordPaymentButton
                              orderId={o.id}
                              balanceDue={balance}
                              label="+ Record Payment"
                              className="w-full rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
                            />
                          </>
                        )}

                        {/* ── In Production: advance to Ready, reassign tailor, payment ── */}
                        {key === 'in_production' && (
                          <>
                            <StageButton orderId={o.id} newStatus="ready_for_pickup" label="→ Ready for Pickup" />
                            <AssignTailorButton
                              orderId={o.id}
                              currentTailorId={o.tailor_id}
                              currentTailorName={o.tailor_name}
                            />
                            <RecordPaymentButton
                              orderId={o.id}
                              balanceDue={balance}
                              label="+ Record Payment"
                              className="w-full rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
                            />
                          </>
                        )}

                        {/* ── Ready for Pickup: balance + delivery decision + payment/alteration ── */}
                        {key === 'ready_for_pickup' && (
                          <>
                            <div className="flex items-center justify-between rounded-md bg-gray-50 px-2.5 py-1.5 text-xs">
                              <span className="text-gray-500">Balance Due</span>
                              <span className={balance > 0 ? 'font-semibold text-red-700' : 'font-semibold text-gray-400'}>
                                {balance > 0 ? formatInr(balance) : '—'}
                              </span>
                            </div>
                            <DeliveryActions orderId={o.id} balanceDue={balance} />
                            <div className="flex gap-2">
                              <RecordPaymentButton
                                orderId={o.id}
                                balanceDue={balance}
                                label="+ Payment"
                                className="flex-1 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
                              />
                              <RequestAlterationButton
                                orderId={o.id}
                                label="+ Alteration"
                                className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
                              />
                            </div>
                          </>
                        )}

                        {/* ── Delivered: residual payment + alteration only ── */}
                        {key === 'delivered' && (
                          <div className="flex gap-2">
                            <RecordPaymentButton
                              orderId={o.id}
                              balanceDue={balance}
                              label="+ Payment"
                              className="flex-1 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
                            />
                            <RequestAlterationButton
                              orderId={o.id}
                              label="+ Alteration"
                              className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
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
