'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { formatInr } from '@/lib/gst';

interface LinkedOrder {
  id: string;
  order_number: string;
  status: 'in_progress' | 'ready_for_pickup' | 'delivered';
  design_name: string;
  color_fabric: string | null;
  total_amount: number;
  balance: number;
}

const STATUS_LABEL: Record<LinkedOrder['status'], string> = {
  in_progress:      'In Progress',
  ready_for_pickup: 'Ready for Pickup',
  delivered:        'Delivered',
};
const STATUS_BADGE: Record<LinkedOrder['status'], string> = {
  in_progress:      'badge-amber',
  ready_for_pickup: 'badge-green',
  delivered:        'badge-gray',
};

/**
 * The "🔗 N items" badge on grouped tailoring orders. Clicking it opens a
 * popup listing every order in the group (fetched from any member), with the
 * current order marked.
 */
export default function LinkedOrdersBadge({
  orderId,
  count,
  label,
  className,
}: {
  orderId: string;
  count: number;
  /** Badge text; defaults to "🔗N". */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<LinkedOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function show(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
    setError(null);
    try {
      const res = await fetch(`/api/tailoring/${orderId}/group`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load linked orders');
      setOrders(data.orders);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        title={`Part of a group of ${count} orders. Click to see them all`}
        className={
          className ??
          'inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200'
        }
      >
        {label ?? `🔗${count}`}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Linked orders ({orders?.length ?? count})</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
            </div>

            {error ? (
              <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            ) : !orders ? (
              <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Order</th>
                      <th className="px-3 py-2 text-left">Design</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((o) => {
                      const current = o.id === orderId;
                      return (
                        <tr key={o.id} className={current ? 'bg-purple-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Link
                              href={`/tailoring/${o.id}`}
                              onClick={() => setOpen(false)}
                              className="font-mono text-xs font-semibold text-purple-700 hover:underline"
                            >
                              {o.order_number}
                            </Link>
                            {current && <span className="ml-2 rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">This order</span>}
                          </td>
                          <td className="px-3 py-2">
                            {o.design_name}
                            {o.color_fabric && <div className="text-xs text-gray-400">{o.color_fabric}</div>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap"><span className={STATUS_BADGE[o.status]}>{STATUS_LABEL[o.status]}</span></td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatInr(o.total_amount)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${o.balance > 0 ? 'font-semibold text-red-700' : 'text-gray-400'}`}>
                            {o.balance > 0 ? formatInr(o.balance) : 'Paid'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
