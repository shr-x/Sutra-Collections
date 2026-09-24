'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatInr } from '@/lib/gst';
import AssignTailorButton from './assign-tailor-button';
import StageButton from './stage-button';
import RecordPaymentButton from '../[id]/record-payment-button';
import RequestAlterationButton from '../[id]/request-alteration-button';
import DeliveryActions from '../[id]/delivery-actions';
import type { TailoringStatus } from '@/types';

export interface OrderRow {
  id: string;
  order_number: string;
  group_number: string | null;
  suffix: string | null;
  status: TailoringStatus;
  total_amount: string;
  amount_paid: string;
  due_date: string | null;
  customer_id: string | null;
  customer_name: string;
  design_name: string;
  color_fabric: string | null;
  tailor_id: string | null;
  tailor_name: string | null;
  batch_id: string | null;
  batch_size: number | null;
}

export type ColumnKey = 'unassigned' | 'in_production' | 'ready_for_pickup' | 'delivered';

// Card content only — the grouping/collapse toggle wraps around this, so the
// same per-column action set (Assign Tailor, Record Payment, Alteration...)
// renders identically whether the card is shown standalone or as part of an
// expanded customer group. Nothing here touches order data — purely display.
function OrderCard({ order: o, columnKey: key }: { order: OrderRow; columnKey: ColumnKey }) {
  const total     = Number(o.total_amount);
  const paid      = Number(o.amount_paid);
  const balance   = Math.max(0, Math.round((total - paid) * 100) / 100);
  const isOverdue = o.due_date && new Date(o.due_date) < new Date() && key !== 'delivered';

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
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
          {balance > 0 && (
            <RecordPaymentButton
              orderId={o.id}
              balanceDue={balance}
              label="+ Record Payment"
              className="w-full rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
            />
          )}
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
          {balance > 0 && (
            <RecordPaymentButton
              orderId={o.id}
              balanceDue={balance}
              label="+ Record Payment"
              className="w-full rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
            />
          )}
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
          <DeliveryActions orderId={o.id} balanceDue={balance} currentTotal={total} />
          <div className="flex gap-2">
            {balance > 0 && (
              <RecordPaymentButton
                orderId={o.id}
                balanceDue={balance}
                label="+ Payment"
                className="flex-1 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
              />
            )}
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
          {balance > 0 && (
            <RecordPaymentButton
              orderId={o.id}
              balanceDue={balance}
              label="+ Payment"
              className="flex-1 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
            />
          )}
          <RequestAlterationButton
            orderId={o.id}
            label="+ Alteration"
            className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
          />
        </div>
      )}
    </div>
  );
}

// Summary card shown in place of a customer's individual cards when their
// group is collapsed. Purely a display toggle — the underlying orders are
// completely unaffected; expanding shows each card exactly as it was.
function GroupSummaryCard({
  customerName, count, combinedBalanceDue, onExpand,
}: {
  customerName: string; count: number; combinedBalanceDue: number; onExpand: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-800">{customerName}</p>
        <p className="text-xs text-gray-500">{count} orders</p>
        <p className="text-xs text-gray-400">Balance Due</p>
        <p className={`text-sm font-semibold ${combinedBalanceDue > 0 ? 'text-red-700' : 'text-gray-400'}`}>
          {combinedBalanceDue > 0 ? formatInr(combinedBalanceDue) : '—'}
        </p>
      </div>
      <button
        type="button"
        onClick={onExpand}
        title="Expand orders"
        aria-label="Expand orders"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-purple-50 hover:text-purple-700"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}

function CollapseToggle({ onCollapse }: { onCollapse: () => void }) {
  return (
    <button
      type="button"
      onClick={onCollapse}
      title="Collapse this customer's orders"
      aria-label="Collapse this customer's orders"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-purple-50 hover:text-purple-700"
    >
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
      </svg>
    </button>
  );
}

export default function ProductionColumn({ columnKey, orders }: { columnKey: ColumnKey; orders: OrderRow[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (orders.length === 0) {
    return <p className="py-8 text-center text-xs text-gray-400">No orders</p>;
  }

  // Group consecutive-in-list orders by customer, preserving overall order —
  // a customer's cards may not be adjacent (list is sorted by due date), so
  // group by key across the whole column, keyed on first occurrence position.
  const groups: { customerKey: string; customerName: string; orders: OrderRow[] }[] = [];
  const indexByKey = new Map<string, number>();
  for (const o of orders) {
    const key = o.customer_id ?? o.customer_name;
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({ customerKey: key, customerName: o.customer_name, orders: [o] });
    } else {
      groups[indexByKey.get(key)!].orders.push(o);
    }
  }

  return (
    <>
      {groups.map((group) => {
        const isGrouped = group.orders.length > 1;
        const isCollapsed = isGrouped && collapsed.has(group.customerKey);

        if (isCollapsed) {
          const combinedBalanceDue = group.orders.reduce(
            (s, o) => s + Math.max(0, Math.round((Number(o.total_amount) - Number(o.amount_paid)) * 100) / 100),
            0
          );
          return (
            <GroupSummaryCard
              key={group.customerKey}
              customerName={group.customerName}
              count={group.orders.length}
              combinedBalanceDue={combinedBalanceDue}
              onExpand={() => setCollapsed((prev) => {
                const next = new Set(prev);
                next.delete(group.customerKey);
                return next;
              })}
            />
          );
        }

        return group.orders.map((o, i) => (
          <div key={o.id} className="relative">
            <OrderCard order={o} columnKey={columnKey} />
            {isGrouped && i === 0 && (
              <div className="absolute -top-1.5 -right-1.5">
                <CollapseToggle
                  onCollapse={() => setCollapsed((prev) => new Set(prev).add(group.customerKey))}
                />
              </div>
            )}
          </div>
        ));
      })}
    </>
  );
}
