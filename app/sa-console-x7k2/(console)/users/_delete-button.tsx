'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { deleteUserAction } from './actions';

function DeleteSubmit({ userName }: { userName: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`Delete user "${userName}"? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
      className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50"
    >
      {pending ? '…' : 'Delete'}
    </button>
  );
}

export default function DeleteUserButton({ userId, userName }: { userId: string; userName: string }) {
  const [state, formAction] = useFormState(deleteUserAction, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={userId} />
      <DeleteSubmit userName={userName} />
      {state?.error && (
        <span className="ml-1 text-xs text-red-400" title={state.error}>!</span>
      )}
    </form>
  );
}
