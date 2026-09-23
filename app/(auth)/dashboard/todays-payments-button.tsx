'use client';

import { useState } from 'react';
import { formatInr } from '@/lib/gst';

interface PaymentRow {
  id: string;
  kind: 'Retail Sale' | 'Due Payment' | 'Tailoring Payment';
  label: string;
  customerName: string | null;
  amount: number;
  mode: string | null;
  time: string;
}

interface Props {
  payments: PaymentRow[];
  total: number;
}

const KIND_BADGE: Record<PaymentRow['kind'], string> = {
  'Retail Sale':        'bg-blue-100 text-blue-700',
  'Due Payment':        'bg-red-100 text-red-700',
  'Tailoring Payment':  'bg-purple-100 text-purple-700',
};

export default function TodaysPaymentsButton({ payments, total }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-green-300 hover:bg-green-50"
      >
        <span className="text-base leading-none">💵</span>
        Today&apos;s Payments
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Today&apos;s Payments Received</h3>
                <p className="text-xs text-gray-400">Actual amounts received today — excludes anything still outstanding.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto px-5 py-3">
              {payments.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No payments received yet today.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_BADGE[p.kind]}`}>
                            {p.kind}
                          </span>
                          <span className="truncate text-xs font-mono text-gray-500">{p.label}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm font-medium text-gray-800">
                          {p.customerName ?? 'Walk-in'}
                        </p>
                        <p className="text-xs text-gray-400 capitalize">
                          {p.mode ?? '—'} · {new Date(p.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-green-700">
                        {formatInr(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
              <span className="text-sm font-medium text-gray-500">
                {payments.length} payment{payments.length !== 1 ? 's' : ''}
              </span>
              <span className="text-base font-bold text-green-700">{formatInr(total)}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
