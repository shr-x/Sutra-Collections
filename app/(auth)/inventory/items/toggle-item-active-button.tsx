'use client';

import { useTransition, useState } from 'react';
import { toggleItemActiveAction } from './actions';

interface Props {
  id: string;
  isActive: boolean;
}

export default function ToggleItemActiveButton({ id, isActive }: Props) {
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function handleClick() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('id', id);
      fd.set('is_active', String(isActive));
      await toggleItemActiveAction(fd);
      const msg = isActive ? 'Item deactivated' : 'Item activated';
      setToast(msg);
      setTimeout(() => setToast(null), 3000);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={
          isActive
            ? 'ml-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-40'
            : 'ml-1 rounded-full border border-green-500 px-3 py-1 text-xs font-semibold text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40'
        }
      >
        {isPending ? '…' : isActive ? 'Deactivate' : 'Activate'}
      </button>
      {toast && (
        <span className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl">
          ✓ {toast}
        </span>
      )}
    </>
  );
}
