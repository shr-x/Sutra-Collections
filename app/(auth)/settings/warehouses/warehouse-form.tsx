'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { WarehouseState } from './actions';
import type { Warehouse } from '@/types';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : label}
    </button>
  );
}

interface Props {
  action: (prev: WarehouseState | null, data: FormData) => Promise<WarehouseState>;
  defaultValues?: Partial<Warehouse>;
}

export default function WarehouseForm({ action, defaultValues }: Props) {
  const [state, formAction] = useFormState(action, null);

  return (
    <form action={formAction} className="space-y-4 max-w-lg">
      {state?.error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div>
        <label className="label mb-1">Warehouse Name *</label>
        <input name="name" className="input" required defaultValue={defaultValues?.name} />
      </div>

      <div>
        <label className="label mb-1">Address</label>
        <textarea name="address" className="input" rows={2} defaultValue={defaultValues?.address ?? ''} />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          name="is_active"
          defaultChecked={defaultValues?.is_active ?? true}
          className="h-4 w-4 rounded border-gray-300 text-purple-600"
        />
        <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
      </div>

      <div className="flex gap-3 pt-2">
        <Submit label={defaultValues ? 'Update Warehouse' : 'Create Warehouse'} />
        <a href="/settings/warehouses" className="btn-secondary">Cancel</a>
      </div>
    </form>
  );
}
