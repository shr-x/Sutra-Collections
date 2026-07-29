'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { advanceStatusAction } from '../actions';
import type { TailoringStatus } from '@/types';

const NEXT: Partial<Record<TailoringStatus, { target: TailoringStatus; label: string }>> = {
  in_progress: { target: 'ready_for_pickup', label: 'Mark Ready for Pickup' },
};

export default function StatusActions({ orderId, status }: { orderId: string; status: TailoringStatus }) {
  const router = useRouter();
  const [isPending, startTrans] = useTransition();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const next = NEXT[status];
  if (!next) return null;

  function handle() {
    startTrans(async () => {
      const res = await advanceStatusAction(orderId, next!.target);
      setToast({ msg: res.message, ok: res.waStatus !== 'failed' });
      setTimeout(() => setToast(null), 4000);
      if (res.success) router.refresh();
    });
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={handle} disabled={isPending} className="btn-primary w-full">
        {isPending ? 'Updating…' : next.label}
      </button>
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-xs rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-xl ${
            toast.ok ? 'bg-green-700' : 'bg-amber-600'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
