'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { requestAlterationAction } from '../actions';

interface Field {
  id: string;
  field_name: string;
  field_type: 'number' | 'text';
  unit: string | null;
}

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
 *
 * Measurement fields + current values are lazy-fetched on open (same pattern
 * as the tailor picker) so this works identically regardless of where it's
 * mounted, without the parent page needing to prefetch measurement data for
 * every card up front.
 */
export default function RequestAlterationButton({ orderId, label = '+ Request Alteration', className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [priceAdjustment, setPriceAdjustment] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

  const [fields, setFields] = useState<Field[]>([]);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [loadingMeasurements, setLoadingMeasurements] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingMeasurements(true);
    fetch(`/api/tailoring/${orderId}/measurements`)
      .then((r) => r.json() as Promise<{ fields?: Field[]; currentMeasurements?: Record<string, string> }>)
      .then((d) => {
        setFields(d.fields ?? []);
        setMeasurements(d.currentMeasurements ?? {});
      })
      .catch(() => { setFields([]); setMeasurements({}); })
      .finally(() => setLoadingMeasurements(false));
  }, [open, orderId]);

  function handleConfirm() {
    if (!description.trim()) { setError('Describe what changed.'); return; }
    const adjustment = parseFloat(priceAdjustment) || 0;
    setError(null);
    startTrans(async () => {
      const res = await requestAlterationAction({
        orderId, description: description.trim(), priceAdjustment: adjustment, measurements,
      });
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
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
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

            <div className="mb-5">
              <label className="label text-xs mb-2 block">Measurements</label>
              {loadingMeasurements ? (
                <p className="text-xs text-gray-400">Loading measurements…</p>
              ) : fields.length === 0 ? (
                <p className="text-xs text-gray-400">No measurement fields defined for this design.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  {fields.map((f) => (
                    <div key={f.id}>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        {f.field_name}
                        {f.unit && <span className="font-normal text-gray-400"> ({f.unit})</span>}
                      </label>
                      <input
                        type={f.field_type === 'number' ? 'number' : 'text'}
                        step={f.field_type === 'number' ? '0.5' : undefined}
                        value={measurements[f.id] ?? ''}
                        onChange={(e) =>
                          setMeasurements((prev) => ({ ...prev, [f.id]: e.target.value }))
                        }
                        className="input w-full text-sm"
                        placeholder={f.field_type === 'number' ? '0.0' : ''}
                      />
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs text-gray-400">
                Saved as a new measurement version — the original measurements are kept in history, never overwritten.
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
