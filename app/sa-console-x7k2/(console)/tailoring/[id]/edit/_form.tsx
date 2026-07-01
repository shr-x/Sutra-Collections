'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { updateSATailoringAction } from '../../actions';
import Link from 'next/link';

interface OrderRow {
  id: string;
  order_number: string;
  stage: string;
  price: string;
  due_date: string | null;
  color_fabric: string | null;
  notes: string | null;
  tailor_id: string | null;
}

interface TailorRow {
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
      {pending ? 'Saving…' : 'Save Changes'}
    </button>
  );
}

export default function EditTailoringForm({
  order,
  tailors,
}: {
  order: OrderRow;
  tailors: TailorRow[];
}) {
  const [state, formAction] = useFormState(updateSATailoringAction, null);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-6">
      <input type="hidden" name="id" value={order.id} />

      <div>
        <label className="mb-1 block text-sm text-gray-400">Stage</label>
        <select
          name="stage"
          defaultValue={order.stage}
          className="w-full appearance-none rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="placed">Placed</option>
          <option value="production">Production</option>
          <option value="ready">Ready</option>
          <option value="delivered">Delivered</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Tailor</label>
        <select
          name="tailor_id"
          defaultValue={order.tailor_id ?? ''}
          className="w-full appearance-none rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">— Unassigned —</option>
          {tailors.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Price (₹)</label>
        <input
          name="price"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={order.price}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Due Date</label>
        <input
          name="due_date"
          type="date"
          defaultValue={order.due_date ?? ''}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Color / Fabric</label>
        <input
          name="color_fabric"
          type="text"
          defaultValue={order.color_fabric ?? ''}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Notes</label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={order.notes ?? ''}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {state?.error && (
        <p className="rounded border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <SubmitButton />
        <Link
          href="/sa-console-x7k2/tailoring"
          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
