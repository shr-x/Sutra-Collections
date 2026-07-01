'use client';

import { useFormStatus } from 'react-dom';
import { cancelInvoiceAction, deleteInvoiceAction } from './actions';

function SubmitBtn({
  label,
  pendingLabel,
  className,
  onClick,
}: {
  label: string;
  pendingLabel: string;
  className: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={onClick}
      className={`${className} disabled:opacity-50`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function CancelInvoiceButton({ id }: { id: string }) {
  return (
    <form action={cancelInvoiceAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitBtn
        label="Cancel"
        pendingLabel="…"
        className="text-xs text-yellow-500 hover:text-yellow-400"
        onClick={(e) => {
          if (!confirm('Mark this invoice as cancelled?')) e.preventDefault();
        }}
      />
    </form>
  );
}

export function DeleteInvoiceButton({
  id,
  invoiceNumber,
}: {
  id: string;
  invoiceNumber: string;
}) {
  return (
    <form action={deleteInvoiceAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitBtn
        label="Delete"
        pendingLabel="…"
        className="text-xs text-red-500 hover:text-red-400"
        onClick={(e) => {
          if (!confirm(`Permanently delete invoice "${invoiceNumber}"? This cannot be undone.`))
            e.preventDefault();
        }}
      />
    </form>
  );
}
