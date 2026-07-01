'use client';

import { useState, useTransition } from 'react';

interface Props {
  balance: number;
  action: (fd: FormData) => Promise<void>;
  invoiceNumber: string;
  customerName: string | null;
  returnTo?: string;
}

export default function CollectPaymentModal({ balance, action, invoiceNumber, customerName, returnTo }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'cash' | 'upi'>('cash');
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    const fd = new FormData();
    fd.set('amount', amount);
    fd.set('payment_mode', mode);
    if (returnTo) fd.set('return_to', returnTo);
    setError('');
    startTransition(async () => {
      try {
        await action(fd);
      } catch {
        setError('Failed to record payment');
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setAmount(balance.toFixed(2)); setError(''); }}
        className="rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 transition-colors"
      >
        Collect Rs.{balance.toFixed(0)}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Collect Payment</h3>
            {customerName && (
              <p className="text-xs text-gray-500 mb-4">{customerName} · {invoiceNumber}</p>
            )}

            {error && (
              <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            <div className="mb-4">
              <p className="label text-xs mb-2">Payment Mode</p>
              <div className="flex gap-2">
                {(['cash', 'upi'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors capitalize ${
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
              <label className="label text-xs">Amount (Rs.)</label>
              <input
                type="number"
                className="input w-full text-lg font-semibold"
                value={amount}
                min="0.01"
                step="0.01"
                max={balance}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-400">Balance due: Rs.{balance.toFixed(2)}</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending || !amount || parseFloat(amount) <= 0}
                className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {pending ? 'Recording…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
