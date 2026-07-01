'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { updateSACustomerAction, type CustomerState } from '../../actions';
import Link from 'next/link';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Save Changes'}
    </button>
  );
}

interface Props {
  id: string;
  defaultValues: {
    name: string;
    phone: string | null;
    address: string | null;
    gstin: string | null;
    credit_limit: string;
  };
}

export function EditCustomerForm({ id, defaultValues }: Props) {
  const boundAction = updateSACustomerAction.bind(null, id);
  const [state, action] = useFormState<CustomerState | null, FormData>(boundAction, null);

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
          defaultValue={defaultValues.name}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="phone">Phone</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={defaultValues.phone ?? ''}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="address">Address</label>
        <textarea
          id="address"
          name="address"
          rows={3}
          defaultValue={defaultValues.address ?? ''}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="gstin">GSTIN</label>
        <input
          id="gstin"
          name="gstin"
          type="text"
          defaultValue={defaultValues.gstin ?? ''}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1" htmlFor="credit_limit">Credit Limit (₹)</label>
        <input
          id="credit_limit"
          name="credit_limit"
          type="number"
          min="0"
          step="0.01"
          defaultValue={defaultValues.credit_limit}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton />
        <Link
          href={`/sa-console-x7k2/customers/${id}`}
          className="text-sm text-gray-400 hover:text-gray-300"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
