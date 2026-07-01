'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createUserAction } from '../actions';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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
      {pending ? 'Creating…' : 'Create User'}
    </button>
  );
}

export default function NewUserPage() {
  const [state, formAction] = useFormState(createUserAction, null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  useEffect(() => {
    fetch('/api/sa-console/warehouses')
      .then((r) => r.json())
      .then((d) => setWarehouses(d.warehouses ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">New User</h1>
        <Link href="/sa-console-x7k2/users" className="text-sm text-gray-500 hover:text-gray-300">
          ← Back
        </Link>
      </div>

      <form action={formAction} className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-6">
        <Field label="Full Name" name="name" type="text" required />
        <Field label="Email" name="email" type="email" required />
        <div>
          <label className="mb-1 block text-sm text-gray-400">Role</label>
          <select
            name="role"
            required
            className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Select role…</option>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
            <option value="accountant">Accountant</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-400">Warehouse (optional)</label>
          <select
            name="warehouse_id"
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
        <Field label="Password (min 8 chars)" name="password" type="password" required />

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
    </div>
  );
}

function Field({
  label,
  name,
  type,
  required,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm text-gray-400">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
      />
    </div>
  );
}
