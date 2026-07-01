'use client';

import { useState, useTransition, useEffect } from 'react';
import { assignTailorAction } from '../actions';

interface Tailor {
  id: string;
  name: string;
  phone: string | null;
  specialty: string | null;
}

interface Props {
  orderId: string;
  currentTailorId: string | null;
  currentTailorName: string | null;
}

export default function AssignTailorButton({ orderId, currentTailorId, currentTailorName }: Props) {
  const [open, setOpen]         = useState(false);
  const [tailors, setTailors]   = useState<Tailor[]>([]);
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/tailoring/tailors')
      .then((r) => r.json() as Promise<{ tailors?: Tailor[] }>)
      .then((d) => setTailors(d.tailors ?? []))
      .catch(() => setTailors([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSelect(tailor: Tailor) {
    setOpen(false);
    startTrans(async () => {
      const fd = new FormData();
      fd.set('order_id',  orderId);
      fd.set('tailor_id', tailor.id);
      const res = await assignTailorAction(fd);
      if (res.success) {
        setToast(`Assigned to ${tailor.name}`);
      } else {
        setToast(`Error: ${res.error ?? 'Failed'}`);
      }
      setTimeout(() => setToast(null), 3500);
    });
  }

  return (
    <div className="mt-2 relative">
      {/* Show current tailor + change link */}
      {currentTailorId && !open ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 truncate">
            ✂ <span className="font-medium text-gray-700">{currentTailorName}</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-1 shrink-0 text-xs text-purple-600 hover:underline"
          >
            Change
          </button>
        </div>
      ) : !open ? (
        /* Button to open tailor picker */
        <button
          type="button"
          disabled={isPending}
          onClick={() => setOpen(true)}
          className="w-full rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-purple-400 hover:text-purple-600 disabled:opacity-40"
        >
          {isPending ? 'Assigning…' : '+ Assign Tailor'}
        </button>
      ) : (
        /* Dropdown picker */
        <div className="relative z-20 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-semibold text-gray-700">Select Tailor</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm leading-none text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          {loading ? (
            <p className="px-3 py-4 text-center text-xs text-gray-400">Loading…</p>
          ) : tailors.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-gray-400">
              No active tailors.{' '}
              <a href="/tailoring/tailors/new" className="text-purple-600 underline">
                Add one →
              </a>
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {tailors.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t)}
                  className="w-full border-b border-gray-50 px-3 py-2.5 text-left text-xs transition-colors hover:bg-purple-50 hover:text-purple-700 last:border-0"
                >
                  <span className="font-medium">{t.name}</span>
                  {t.specialty && (
                    <span className="ml-1 text-gray-400">· {t.specialty}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <span className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl">
          {toast}
        </span>
      )}
    </div>
  );
}
