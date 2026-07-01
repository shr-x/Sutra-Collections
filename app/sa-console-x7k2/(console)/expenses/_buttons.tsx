'use client';

import { useFormStatus } from 'react-dom';
import { deleteSAExpenseAction } from './actions';

function DeleteSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50"
    >
      {pending ? '…' : 'Delete'}
    </button>
  );
}

export function DeleteExpenseButton({ id }: { id: string }) {
  return (
    <form action={deleteSAExpenseAction}>
      <input type="hidden" name="id" value={id} />
      <DeleteSubmit />
    </form>
  );
}
