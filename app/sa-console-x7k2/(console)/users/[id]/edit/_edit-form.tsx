'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { editUserAction } from '../../actions';
import Link from 'next/link';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  base_salary: string;
  warehouse_id: string | null;
  access_expires_at: string | null;
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
      {pending ? 'Saving…' : 'Save Changes'}
    </button>
  );
}

export default function EditUserForm({
  user,
  warehouses,
}: {
  user: UserRow;
  warehouses: Warehouse[];
}) {
  const [state, formAction] = useFormState(editUserAction, null);

  // Format access_expires_at as datetime-local value (YYYY-MM-DDTHH:mm)
  const expiresValue = user.access_expires_at
    ? new Date(user.access_expires_at).toISOString().slice(0, 16)
    : '';

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-6">
      <input type="hidden" name="id" value={user.id} />

      <div>
        <label className="mb-1 block text-sm text-gray-400">Full Name</label>
        <input
          name="name"
          type="text"
          defaultValue={user.name}
          required
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Email</label>
        <input
          name="email"
          type="email"
          defaultValue={user.email}
          required
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Role</label>
        <select
          name="role"
          defaultValue={user.role}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
          <option value="accountant">Accountant</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Active</label>
        <select
          name="is_active"
          defaultValue={user.is_active ? 'true' : 'false'}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Base Salary (₹)</label>
        <input
          name="base_salary"
          type="number"
          min="0"
          step="0.01"
          defaultValue={user.base_salary}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">Warehouse</label>
        <select
          name="warehouse_id"
          defaultValue={user.warehouse_id ?? ''}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">None</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">
          Access Expires At (leave blank = no expiry)
        </label>
        <input
          name="access_expires_at"
          type="datetime-local"
          defaultValue={expiresValue}
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-400">
          New Password (leave blank to keep current)
        </label>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          placeholder="Leave blank to keep current password"
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
          href="/sa-console-x7k2/users"
          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
