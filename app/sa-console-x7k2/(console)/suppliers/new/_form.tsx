'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { createSASupplierAction, type SupplierState } from '../actions';
import Link from 'next/link';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Create Supplier'}
    </button>
  );
}

export function NewSupplierForm() {
  const [state, action] = useFormState<SupplierState | null, FormData>(createSASupplierAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="rounded border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-300">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="name">Name *</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="phone">Phone</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="address">Address</label>
        <textarea
          id="address"
          name="address"
          rows={3}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="gstin">GSTIN</label>
        <input
          id="gstin"
          name="gstin"
          type="text"
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton />
        <Link
          href="/sa-console-x7k2/suppliers"
          className="text-sm text-gray-400 hover:text-gray-300"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
