'use client';

import { useFormStatus } from 'react-dom';
import { deleteSAPurchaseAction } from './actions';

function DeleteSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50"
    >
      {pending ? '…' : label}
    </button>
  );
}

export function DeletePurchaseButton({
  id,
  invoiceNumber,
}: {
  id: string;
  invoiceNumber: string;
}) {
  return (
    <form action={deleteSAPurchaseAction}>
      <input type="hidden" name="id" value={id} />
      <DeleteSubmit
        label="Delete"
      />
    </form>
  );
}
