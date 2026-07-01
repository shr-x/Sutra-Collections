'use client';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createSASchemeAction } from '../actions';
import Link from 'next/link';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? 'Creating…' : 'Create Scheme'}
    </button>
  );
}

export default function NewSchemeForm() {
  const [state, formAction] = useFormState(createSASchemeAction, null);
  const [schemeType, setSchemeType] = useState('flat');

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
        <label className="mb-1 block text-sm text-gray-400">Type</label>
        <select
          name="scheme_type"
          value={schemeType}
          onChange={(e) => setSchemeType(e.target.value)}
          className="w-full appearance-none rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="flat">Flat Discount</option>
          <option value="percent">Percent Discount</option>
          <option value="buy_x_get_y">Buy X Get Y</option>
          <option value="seasonal">Seasonal</option>
        </select>
      </div>

      {schemeType === 'buy_x_get_y' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Buy Quantity</label>
            <input
              name="buy_quantity"
              type="number"
              min="1"
              step="1"
              className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Get Quantity (free)</label>
            <input
              name="get_quantity"
              type="number"
              min="1"
              step="1"
              className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {schemeType !== 'buy_x_get_y' && (
        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Discount Value {schemeType === 'percent' ? '(%)' : '(₹)'}
          </label>
          <input
            name="discount_value"
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm text-gray-400">Min Order Value (₹)</label>
        <input
          name="min_order_value"
          type="number"
          min="0"
          step="0.01"
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm text-gray-400">Valid From</label>
          <input
            name="valid_from"
            type="date"
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-400">Valid Until</label>
          <input
            name="valid_until"
            type="date"
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
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
          href="/sa-console-x7k2/schemes"
          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
