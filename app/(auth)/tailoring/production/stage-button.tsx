'use client';

import { useTransition, useState } from 'react';
import { advanceStageAction } from '../actions';
import type { TailoringStage } from '@/types';

interface Props {
  orderId: string;
  newStage: TailoringStage;
  label: string;
}

export default function StageButton({ orderId, newStage, label }: Props) {
  const [isPending, startTrans] = useTransition();
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  function handle() {
    startTrans(async () => {
      const res = await advanceStageAction(orderId, newStage);
      const ok  = res.waStatus !== 'failed';
      setToast({ msg: res.message, ok });
      setTimeout(() => setToast(null), 4500);
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={handle}
        className="w-full rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-40"
      >
        {isPending ? 'Updating…' : label}
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
    </>
  );
}
