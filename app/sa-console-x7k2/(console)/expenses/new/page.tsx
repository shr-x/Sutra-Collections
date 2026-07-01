'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createSAExpenseAction } from '../actions';
import Link from 'next/link';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Create Expense'}
    </button>
  );
}

export default function NewExpensePage() {
  const [state, formAction] = useFormState(createSAExpenseAction, null);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">New Expense</h1>
        <Link
          href="/sa-console-x7k2/expenses"
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          ← Back
        </Link>
      </div>

      <form action={formAction} className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-6">
        <div>
          <label htmlFor="expense_date" className="mb-1 block text-sm text-gray-400">
            Date
          </label>
          <input
            id="expense_date"
            name="expense_date"
            type="date"
            required
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-sm text-gray-400">
            Description
          </label>
          <input
            id="description"
            name="description"
            type="text"
            required
            placeholder="e.g. Electricity bill, Staff lunch…"
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="amount" className="mb-1 block text-sm text-gray-400">
            Amount (₹)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">Payment Mode</label>
          <select
            name="payment_mode"
            defaultValue="cash"
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
          </select>
        </div>

        <div>
          <label htmlFor="notes" className="mb-1 block text-sm text-gray-400">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Additional details…"
          />
        </div>

        <p className="text-xs text-gray-500">
          Note: Category is managed separately through the main app. This SA form records the expense without a category.
        </p>

        {state?.error && (
          <p className="rounded border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-300">
            {state.error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <SubmitButton />
          <Link
            href="/sa-console-x7k2/expenses"
            className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:text-white"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
