'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestAlterationAction } from '../actions';

const fmt = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(Math.abs(n))}`;

interface AlterationRow {
  id: string;
  description: string;
  price_adjustment: number;
  requested_at: string;
  requested_by_name: string | null;
}

interface Props {
  orderId: string;
  status: string;
  alterations: AlterationRow[];
}

const ELIGIBLE_STATUSES = ['ready_for_pickup', 'picked_up', 'delivered'];

export default function AlterationSection({ orderId, status, alterations }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [priceAdjustment, setPriceAdjustment] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

  const canRequest = ELIGIBLE_STATUSES.includes(status);

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

  if (!canRequest && alterations.length === 0) return null;

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Alterations</h2>
        {canRequest && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full border-2 border-purple-500 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100"
          >
            + Request Alteration
          </button>
        )}
      </div>

      {alterations.length === 0 ? (
        <p className="text-xs text-gray-400">No alterations requested yet.</p>
      ) : (
        <ul className="space-y-3">
          {alterations.map((a) => (
            <li key={a.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-800 whitespace-pre-line">{a.description}</p>
                {a.price_adjustment !== 0 && (
                  <span className={`shrink-0 text-sm font-semibold ${a.price_adjustment > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {a.price_adjustment > 0 ? '+' : '-'}{fmt(a.price_adjustment)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {new Date(a.requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {a.requested_by_name ? ` · ${a.requested_by_name}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

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
    </div>
  );
}
