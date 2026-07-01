'use client';

import DatePicker from '@/components/date-picker';

import { useFormState, useFormStatus } from 'react-dom';
import { createExpenseAction } from './actions';
import type { ActionResult } from '@/types';

const INIT: ActionResult = { success: false, error: '' };

interface Category { id: string; name: string; }

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-purple-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving…' : 'Record Expense'}
    </button>
  );
}

export default function ExpenseForm({ categories }: { categories: Category[] }) {
  const [state, action] = useFormState(createExpenseAction, INIT);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        {/* Row 1: Date + Category */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Date</label>
            <DatePicker name="expense_date" defaultValue={today} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Category</label>
            <select name="category_id" required className="input w-full">
              <option value="">— select category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Description full width */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Description</label>
          <input
            name="description"
            type="text"
            required
            placeholder="e.g. August rent payment"
            className="input w-full"
          />
        </div>

        {/* Row 3: Amount + Payment Mode */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Amount (₹)</label>
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="0.00"
              className="input w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Payment Mode</label>
            <select name="payment_mode" required className="input w-full">
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>
        </div>

        {/* Row 4: Notes full width */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Notes (optional)</label>
          <textarea
            name="notes"
            rows={2}
            className="input w-full resize-none"
            placeholder="Additional notes…"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <a href="/accounting/expenses" className="rounded-full border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </a>
        <SubmitBtn />
      </div>
    </form>
  );
}
