'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createDesignAction, type DesignState } from '../actions';

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : 'Create Design'}
    </button>
  );
}

export default function DesignForm() {
  const [state, formAction] = useFormState<DesignState, FormData>(createDesignAction, {});

  return (
    <form action={formAction} encType="multipart/form-data" className="card space-y-4">
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Design Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          required
          className="input w-full"
          placeholder="e.g. Anarkali Kurta"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
        <input
          type="text"
          name="category"
          className="input w-full"
          placeholder="e.g. Kurta, Blouse, Lehenga…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          className="input w-full"
          placeholder="Optional notes about this design style…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">GST Rate</label>
        <select name="gst_rate" defaultValue="5" className="input w-full">
          <option value="0">0%</option>
          <option value="5">5%</option>
          <option value="12">12%</option>
          <option value="18">18%</option>
          <option value="28">28%</option>
        </select>
        <p className="mt-1 text-xs text-gray-400">Used for GST calculation on tailoring orders for this design</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Design Photo</label>
        <input
          type="file"
          name="photo"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="block text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-purple-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-purple-700 hover:file:bg-purple-100"
        />
        <p className="mt-1 text-xs text-gray-400">PNG, JPG, GIF or WebP · Max 5 MB</p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <a href="/designs" className="btn-secondary">Cancel</a>
        <SubmitBtn />
      </div>
    </form>
  );
}
