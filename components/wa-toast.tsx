'use client';

import { useEffect, useState } from 'react';

interface Props {
  wa?: string;
  reason?: string;
  retryAction?: () => Promise<void>;
}

export default function WaToast({ wa, reason, retryAction }: Props) {
  const [visible, setVisible] = useState(wa === 'sent' || wa === 'failed');

  // Auto-dismiss the success toast only
  useEffect(() => {
    if (wa !== 'sent' || !visible) return;
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  // Success: bottom-right dismissing toast
  if (wa === 'sent') {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
        ✓ WhatsApp sent
      </div>
    );
  }

  // Failure: sticky top banner with reason + retry
  if (wa === 'failed') {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="mt-0.5 shrink-0 text-base">⚠️</span>
        <div className="flex-1">
          <p className="font-semibold">Invoice saved, but WhatsApp message failed to send.</p>
          {reason && (
            <p className="mt-0.5 text-xs text-amber-700">
              Reason: {decodeURIComponent(reason)}
            </p>
          )}
          {retryAction && (
            <form action={retryAction} className="mt-2">
              <button
                type="submit"
                className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 transition-colors"
              >
                Retry WhatsApp
              </button>
            </form>
          )}
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 text-amber-600 hover:text-amber-900 transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}
