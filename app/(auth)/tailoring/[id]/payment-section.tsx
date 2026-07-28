'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordTailoringPaymentAction } from '../actions';
import type { TailoringPaymentMode } from '@/types';

const fmt = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n)}`;

interface PaymentRow {
  id: string;
  amount: number;
  payment_mode: TailoringPaymentMode;
  recorded_at: string;
  recorded_by_name: string | null;
}

interface Props {
  orderId: string;
  totalAmount: number;
  amountPaid: number;
  creditAmount: number;
  payments: PaymentRow[];
}

export default function PaymentSection({ orderId, totalAmount, amountPaid, creditAmount, payments }: Props) {
  const router = useRouter();
  const balanceDue = Math.round((totalAmount - amountPaid) * 100) / 100;

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balanceDue > 0 ? balanceDue.toFixed(2) : '');
  const [mode, setMode] = useState<TailoringPaymentMode>('cash');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

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
    <div className="card">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Payment</h2>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Total Amount</span>
          <span className="font-medium">{fmt(totalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Amount Paid</span>
          <span className="font-medium text-green-700">{fmt(amountPaid)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-100 pt-2">
          <span className="font-semibold text-gray-700">Balance Due</span>
          <span className={`text-base font-bold ${balanceDue > 0 ? 'text-red-700' : 'text-gray-400'}`}>
            {balanceDue > 0 ? fmt(balanceDue) : '—'}
          </span>
        </div>
        {creditAmount > 0 && (
          <div className="flex justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mt-1">
            <span className="text-xs font-medium text-amber-800">On Credit (customer dues)</span>
            <span className="text-sm font-bold text-amber-800">{fmt(creditAmount)}</span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => { setOpen(true); setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : ''); setError(null); }}
        className="mt-4 w-full rounded-lg border-2 border-dashed border-purple-200 py-2 text-sm font-medium text-purple-600 transition-colors hover:border-purple-400 hover:bg-purple-50"
      >
        + Record Payment
      </button>

      {payments.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">Payment History</p>
          <ul className="space-y-1.5">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-medium text-gray-700">{fmt(p.amount)}</span>
                  <span className="ml-1.5 uppercase text-gray-400">{p.payment_mode}</span>
                  {p.recorded_by_name && <span className="ml-1.5 text-gray-400">· {p.recorded_by_name}</span>}
                </div>
                <span className="text-gray-400">
                  {new Date(p.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
    </div>
  );
}
