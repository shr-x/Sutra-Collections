'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adjustPickupPriceAction } from '../actions';

const fmt = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n)}`;

interface Props {
  orderId: string;
  currentTotal: number;
  className?: string;
}

/**
 * Lightweight price-only editor for the pickup step — sibling to
 * RequestAlterationButton but without measurements/due-date, and only usable
 * while the order is still 'ready_for_pickup' (enforced server-side too).
 */
export default function EditPriceButton({ orderId, currentTotal, className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

  const adjustment = parseFloat(amount) || 0;
  const newTotal = Math.max(0, currentTotal + adjustment);

  function handleConfirm() {
    if (!reason.trim()) { setError('Enter a reason for the price change.'); return; }
    if (!adjustment) { setError('Enter a non-zero amount.'); return; }
    setError(null);
    startTrans(async () => {
      const res = await adjustPickupPriceAction(orderId, adjustment, reason.trim());
      if (res.success) {
        setOpen(false);
        setReason('');
        setAmount('0');
        router.refresh();
      } else {
        setError(res.error ?? 'Failed to update price.');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? 'w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50'}
      >
        ✎ Edit Price
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-gray-900">Edit Price at Pickup</h3>

            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            <p className="mb-4 text-xs text-gray-500">Current total: <span className="font-semibold text-gray-700">{fmt(currentTotal)}</span></p>

            <div className="mb-4">
              <label className="label text-xs">Reason</label>
              <textarea
                rows={2}
                className="input w-full text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Extra embroidery done, discount given…"
              />
            </div>

            <div className="mb-5">
              <label className="label text-xs">Price Adjustment (₹)</label>
              <input
                type="number"
                step="0.01"
                className="input w-full text-lg font-semibold"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="mt-1 text-xs text-gray-400">
                Positive to add cost, negative to reduce it. New total: <span className="font-semibold">{fmt(newTotal)}</span>
              </p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 btn-secondary text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending || !reason.trim() || !adjustment}
                className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
