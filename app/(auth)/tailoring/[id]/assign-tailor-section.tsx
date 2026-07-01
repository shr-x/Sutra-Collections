'use client';

import { useState, useTransition, useEffect } from 'react';
import { assignTailorAction, changeTailorAction } from '../actions';

interface Tailor { id: string; name: string; specialty: string | null }

interface Props {
  orderId: string;
  stage: string;
  currentTailorId: string | null;
  currentTailorName: string | null;
}

export default function AssignTailorSection({ orderId, stage, currentTailorId, currentTailorName }: Props) {
  const [tailors, setTailors]   = useState<Tailor[]>([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const [toast, setToast]       = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

  useEffect(() => {
    setLoading(true);
    fetch('/api/tailoring/tailors')
      .then((r) => r.json() as Promise<{ tailors?: Tailor[] }>)
      .then((d) => setTailors(d.tailors ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function handleAssign(tailor: Tailor) {
    setOpen(false);
    startTrans(async () => {
      const fd = new FormData();
      fd.set('order_id', orderId);
      fd.set('tailor_id', tailor.id);
      const res = await assignTailorAction(fd);
      if (res.success) {
        showToast(`✅ Tailor assigned. WhatsApp being sent…`);
        // Reload to reflect new stage
        setTimeout(() => window.location.reload(), 1200);
      } else {
        showToast(`⚠️ ${res.error ?? 'Failed to assign tailor.'}`);
      }
    });
  }

  function handleChange(tailor: Tailor) {
    setOpen(false);
    startTrans(async () => {
      const fd = new FormData();
      fd.set('order_id', orderId);
      fd.set('tailor_id', tailor.id);
      const res = await changeTailorAction(fd);
      if (res.success) {
        showToast(`✅ Tailor changed. WhatsApp sent to ${tailor.name}.`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        showToast(`⚠️ ${res.error ?? 'Failed.'}`);
      }
    });
  }

  const handleSelect = stage === 'placed' ? handleAssign : handleChange;
  const isAssigning  = stage === 'placed';

  if (stage !== 'placed' && stage !== 'production') return null;

  return (
    <div>
      {/* Assigned tailor display */}
      {currentTailorId && !open && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
          <div>
            <p className="text-xs text-gray-500">Assigned Tailor</p>
            <p className="text-sm font-semibold text-gray-800">✂ {currentTailorName}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 ml-2 rounded-full border-2 border-purple-500 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100"
          >
            ✏️ Change Tailor
          </button>
        </div>
      )}

      {/* Assign button when no tailor yet (placed stage) */}
      {isAssigning && !currentTailorId && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={isPending}
          className="mb-3 w-full rounded-lg border-2 border-dashed border-purple-200 py-2.5 text-sm font-medium text-purple-600 transition-colors hover:border-purple-400 hover:bg-purple-50 disabled:opacity-40"
        >
          {isPending ? 'Assigning…' : '+ Assign Tailor & Move to Production'}
        </button>
      )}

      {/* Tailor picker dropdown */}
      {open && (
        <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
            <span className="text-xs font-semibold text-gray-700">
              {isAssigning ? 'Assign Tailor' : 'Change Tailor'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-lg leading-none text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          {loading ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Loading…</p>
          ) : tailors.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              No active tailors.{' '}
              <a href="/tailoring/tailors/new" className="text-purple-600 underline">Add one →</a>
            </p>
          ) : (
            <div className="max-h-56 divide-y divide-gray-50 overflow-y-auto">
              {tailors.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t)}
                  disabled={isPending}
                  className="w-full px-4 py-3 text-left text-sm transition-colors hover:bg-purple-50 hover:text-purple-700 disabled:opacity-40"
                >
                  <span className="font-medium">{t.name}</span>
                  {t.specialty && <span className="ml-2 text-xs text-gray-400">{t.specialty}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
