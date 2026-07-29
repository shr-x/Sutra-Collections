'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestAlterationAction } from '../actions';

interface Props {
  orderId: string;
  label?: string;
  className?: string;
}

/**
 * Self-contained Request Alteration trigger + modal. Used both on the order
 * detail page (via AlterationSection) and directly on production board cards
 * (Ready for Pickup / Delivered columns) — anywhere staff need to reopen an
 * order without navigating away.
 */
export default function RequestAlterationButton({ orderId, label = '+ Request Alteration', className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [priceAdjustment, setPriceAdjustment] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

  function handleConfirm() {
    if (!description.trim()) { setError('Describe what changed.'); return; }
    const adjustment = parseFloat(priceAdjustment) || 0;
    setError(null);
    startTrans(async () => {
      const res = await requestAlterationAction({ orderId, description: description.trim(), priceAdjustment: adjustment });
      if (res.success) {
        setOpen(false);
        setDescription('');
        setPriceAdjustment('0');
        router.refresh();
      } else {
        setError(res.error ?? 'Failed to save alteration.');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? 'rounded-full border-2 border-purple-500 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100'}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-gray-900">Request Alteration</h3>

            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            <div className="mb-4">
              <label className="label text-xs">What changed?</label>
              <textarea
                rows={3}
                className="input w-full text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Loosen waist by 1 inch, remove embroidery on sleeve…"
              />
            </div>

            <div className="mb-5">
              <label className="label text-xs">Price Adjustment (₹)</label>
              <input
                type="number"
                step="0.01"
                className="input w-full text-lg font-semibold"
                value={priceAdjustment}
                onChange={(e) => setPriceAdjustment(e.target.value)}
                placeholder="0.00"
              />
              <p className="mt-1 text-xs text-gray-400">
                Positive to add cost, negative to reduce it, or 0 if the price doesn't change. This reopens the order — status resets to In Progress.
              </p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 btn-secondary text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending || !description.trim()}
                className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save & Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
