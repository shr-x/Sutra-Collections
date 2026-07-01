'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { SupplierState } from './actions';
import type { Supplier } from '@/types';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Saving…' : label}</button>;
}

interface Props {
  action: (prev: SupplierState | null, data: FormData) => Promise<SupplierState>;
  defaultValues?: Partial<Supplier>;
  cancelHref: string;
}

export default function SupplierForm({ action, defaultValues, cancelHref }: Props) {
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className="space-y-5 max-w-lg">
      {state?.error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <div>
        <label className="label mb-1">Supplier Name *</label>
        <input name="name" className="input" required defaultValue={defaultValues?.name} />
      </div>
      <div>
        <label className="label mb-1">Phone *</label>
        <input name="phone" type="tel" className="input" required maxLength={20} defaultValue={defaultValues?.phone} />
      </div>
      <div>
        <label className="label mb-1">GSTIN <span className="font-normal text-gray-400">(optional)</span></label>
        <input
          name="gstin"
          className="input font-mono uppercase"
          maxLength={15}
          placeholder="22AAAAA0000A1Z5"
          defaultValue={defaultValues?.gstin ?? ''}
        />
      </div>
      <div>
        <label className="label mb-1">Address</label>
        <textarea name="address" className="input" rows={2} defaultValue={defaultValues?.address ?? ''} />
      </div>
      <div className="flex gap-3 pt-2">
        <Submit label={defaultValues ? 'Update Supplier' : 'Create Supplier'} />
        <a href={cancelHref} className="btn-secondary">Cancel</a>
      </div>
    </form>
  );
}
