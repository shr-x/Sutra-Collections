'use client';

import DatePicker from '@/components/date-picker';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import type { FormState } from './actions';

function SubmitBtn({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
      {pending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
    </button>
  );
}

interface Warehouse { id: string; name: string }

interface Props {
  action: (prev: FormState | null, formData: FormData) => Promise<FormState>;
  warehouses: Warehouse[];
  defaultValues?: {
    name?: string; email?: string; role?: string;
    warehouse_id?: string | null; access_expires_at?: string | null; base_salary?: number;
  };
  isEdit?: boolean;
}

export default function UserForm({ action, warehouses, defaultValues = {}, isEdit = false }: Props) {
  const [state, formAction] = useFormState(action, null);

  return (
    <form action={formAction} className="max-w-lg card space-y-5">
      {state?.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="label">Full Name *</label>
        <input name="name" type="text" required defaultValue={defaultValues.name}
               className="input" placeholder="Staff name" />
        {state?.fieldErrors?.name && (
          <p className="text-xs text-red-500 mt-1">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      <div>
        <label className="label">Email *</label>
        <input name="email" type="email" required defaultValue={defaultValues.email}
               className="input" placeholder="staff@example.com" />
        {state?.fieldErrors?.email && (
          <p className="text-xs text-red-500 mt-1">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div>
        <label className="label">{isEdit ? 'New Password' : 'Password *'}</label>
        <input name="password" type="password" required={!isEdit} minLength={6}
               className="input" placeholder={isEdit ? 'Leave blank to keep current' : 'Min 6 characters'} />
        {state?.fieldErrors?.password && (
          <p className="text-xs text-red-500 mt-1">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Role *</label>
          <select name="role" className="input" defaultValue={defaultValues.role ?? 'staff'}>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
            <option value="accountant">Accountant</option>
          </select>
        </div>
        <div>
          <label className="label">Base Salary ₹/mo</label>
          <input name="base_salary" type="number" min="0" step="100"
                 defaultValue={defaultValues.base_salary ?? 0} className="input" />
        </div>
      </div>

      <div>
        <label className="label">Assigned Warehouse (Staff only)</label>
        <select name="warehouse_id" className="input" defaultValue={defaultValues.warehouse_id ?? ''}>
          <option value="">— None (Admin / Accountant) —</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">Staff are scoped to one warehouse. Leave blank for Admin/Accountant roles.</p>
      </div>

      <div>
        <label className="label">Access Expires At</label>
        <DatePicker
          name="access_expires_at"
          defaultValue={defaultValues.access_expires_at?.split('T')[0] ?? ''}
          className="input"
        />
        <p className="text-xs text-gray-400 mt-1">Leave blank for permanent access. Use for contract / seasonal staff.</p>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Link href="/settings/users" className="btn-secondary">Cancel</Link>
        <SubmitBtn isEdit={isEdit} />
      </div>
    </form>
  );
}
