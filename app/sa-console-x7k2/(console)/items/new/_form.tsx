'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { createSAItemAction } from '../actions';
import Link from 'next/link';

interface Category {
  id: string;
  name: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? 'Creating…' : 'Create Item'}
    </button>
  );
}

export default function NewItemForm({ categories }: { categories: Category[] }) {
  const [state, formAction] = useFormState(createSAItemAction, null);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-6">
      <div>
        <label className="mb-1 block text-sm text-gray-400">Name *</label>
        <input
          name="name"
          type="text"
          required
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Category</label>
        <select
          name="category_id"
          className="w-full appearance-none rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">— None —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Type</label>
        <select
          name="item_type"
          defaultValue="finished"
          className="w-full appearance-none rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="finished">Finished Good</option>
          <option value="raw_material">Raw Material</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Unit</label>
        <input
          name="unit"
          type="text"
          placeholder="pcs"
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">HSN Code (min 4 digits)</label>
        <input
          name="hsn_code"
          type="text"
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">GST Rate</label>
        <select
          name="gst_rate"
          defaultValue="0"
          className="w-full appearance-none rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          {[0, 5, 12, 18, 28].map((r) => (
            <option key={r} value={r}>
              {r}%
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          name="is_active"
          type="checkbox"
          id="is_active_new"
          defaultChecked
          className="h-4 w-4 rounded border-gray-600 bg-gray-700 accent-indigo-500"
        />
        <label htmlFor="is_active_new" className="text-sm text-gray-400">
          Active
        </label>
      </div>

      {state?.error && (
        <p className="rounded border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <SubmitButton />
        <Link
          href="/sa-console-x7k2/items"
          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
