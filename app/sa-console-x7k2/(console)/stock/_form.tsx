'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { stockAdjustAction } from './actions';

interface Item {
  id: string;
  name: string;
  unit: string;
}

interface Warehouse {
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
      {pending ? 'Saving…' : 'Apply Adjustment'}
    </button>
  );
}

export default function StockAdjustForm({
  items,
  warehouses,
}: {
  items: Item[];
  warehouses: Warehouse[];
}) {
  const [state, formAction] = useFormState(stockAdjustAction, null);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-6">
      <div>
        <label className="mb-1 block text-sm text-gray-400">Item</label>
        <select
          name="item_id"
          required
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Select item…</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.unit})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Warehouse</label>
        <select
          name="warehouse_id"
          required
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Select warehouse…</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">
          Quantity (positive = add, negative = remove)
        </label>
        <input
          name="quantity"
          type="number"
          required
          placeholder="e.g. 10 or -5"
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Reason (optional)</label>
        <input
          name="reason"
          type="text"
          placeholder="e.g. Cycle count correction"
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {state?.error && (
        <p className="rounded border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
