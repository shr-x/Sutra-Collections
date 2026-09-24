'use client';

import { useState, useTransition } from 'react';
import DatePicker from '@/components/date-picker';

import { useFormState, useFormStatus } from 'react-dom';
import { createExpenseAction, createExpenseCategoryAction } from './actions';
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

export default function ExpenseForm({ categories: initialCategories }: { categories: Category[] }) {
  const [state, action] = useFormState(createExpenseAction, INIT);
  const today = new Date().toISOString().slice(0, 10);

  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleCategorySelect(value: string) {
    if (value === '__new__') {
      setAddingCategory(true);
      setCategoryError('');
      return;
    }
    setCategoryId(value);
  }

  function handleSaveCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setCategoryError('');
    startTransition(async () => {
      const res = await createExpenseCategoryAction(name);
      if (res.success && res.category) {
        setCategories((prev) => (
          prev.some((c) => c.id === res.category!.id) ? prev : [...prev, res.category!].sort((a, b) => a.name.localeCompare(b.name))
        ));
        setCategoryId(res.category.id);
        setAddingCategory(false);
        setNewCategoryName('');
      } else {
        setCategoryError(res.error ?? 'Failed to create category.');
      }
    });
  }

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
            <select
              name="category_id"
              required
              value={categoryId}
              onChange={(e) => handleCategorySelect(e.target.value)}
              className="input w-full"
            >
              <option value="">— select category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="__new__">+ Add new category</option>
            </select>

            {addingCategory && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-2.5">
                <div className="flex-1">
                  <input
                    type="text"
                    autoFocus
                    value={newCategoryName}
                    onChange={(e) => { setNewCategoryName(e.target.value); setCategoryError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveCategory(); } }}
                    placeholder="New category name"
                    className="input w-full text-sm"
                  />
                  {categoryError && <p className="mt-1 text-xs text-red-600">{categoryError}</p>}
                </div>
                <button
                  type="button"
                  onClick={handleSaveCategory}
                  disabled={isPending || !newCategoryName.trim()}
                  className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingCategory(false); setNewCategoryName(''); setCategoryError(''); }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )}
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
