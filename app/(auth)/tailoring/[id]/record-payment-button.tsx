'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordTailoringPaymentAction } from '../actions';
import type { TailoringPaymentMode } from '@/types';

const fmt = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n)}`;

interface Props {
  orderId: string;
  balanceDue?: number;
  label?: string;
  className?: string;
}

/**
 * Self-contained Record Payment trigger + modal. Used both on the order
 * detail page (via PaymentSection) and directly on production board cards —
 * anywhere staff need to log an advance/partial payment without navigating away.
 */
export default function RecordPaymentButton({ orderId, balanceDue = 0, label = '+ Record Payment', className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balanceDue > 0 ? balanceDue.toFixed(2) : '');
  const [mode, setMode] = useState<TailoringPaymentMode>('cash');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

  function handleOpen() {
    setOpen(true);
    setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
    setError(null);
  }

  function handleConfirm() {
    const parsed = parseFloat(amount);
    if (!(parsed > 0)) { setError('Enter an amount greater than zero.'); return; }
    setError(null);
    startTrans(async () => {
      const res = await recordTailoringPaymentAction({ orderId, amount: parsed, paymentMode: mode });
      if (res.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? 'Failed to record payment.');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={className ?? 'w-full rounded-lg border-2 border-dashed border-purple-200 py-2 text-sm font-medium text-purple-600 transition-colors hover:border-purple-400 hover:bg-purple-50'}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-gray-900">Record Payment</h3>

            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            <div className="mb-4">
              <p className="label text-xs mb-2">Payment Mode</p>
              <div className="flex gap-2">
                {(['cash', 'upi', 'card'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                      mode === m
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                    }`}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="label text-xs">Amount (₹)</label>
              <input
                type="number"
                className="input w-full text-lg font-semibold"
                value={amount}
                min="0.01"
                step="0.01"
                onChange={(e) => setAmount(e.target.value)}
              />
              {balanceDue > 0 && <p className="mt-1 text-xs text-gray-400">Balance due: {fmt(balanceDue)}</p>}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setOpen(false)} className="flex-1 btn-secondary text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending || !amount || parseFloat(amount) <= 0}
                className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {isPending ? 'Recording…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
