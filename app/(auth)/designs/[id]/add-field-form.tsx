'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { addFieldAction, type FieldState } from '../actions';

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary text-sm">
      {pending ? 'Adding…' : 'Add Field'}
    </button>
  );
}

export default function AddFieldForm({ designId }: { designId: string }) {
  const [state, formAction] = useFormState<FieldState, FormData>(addFieldAction, {});

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold text-gray-900 text-sm">Add Measurement Field</h3>

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="design_id" value={designId} />

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Field Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="field_name"
            required
            className="input w-full"
            placeholder="e.g. Chest, Length…"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select name="field_type" className="input">
            <option value="number">Number</option>
            <option value="text">Text</option>
          </select>
        </div>

        <div className="w-24">
          <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
          <input
            type="text"
            name="unit"
            className="input w-full"
            placeholder="cm / in"
          />
        </div>

        <SubmitBtn />
      </form>
    </div>
  );
}
