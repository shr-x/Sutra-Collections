import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import { toggleUserActiveAction } from './actions';
import ConfirmForm from '@/components/confirm-form';

export const metadata: Metadata = { title: 'Users' };

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  warehouse_name: string | null;
  access_expires_at: Date | null;
  base_salary: number;
  is_active: boolean;
}

const ROLE_BADGE: Record<string, string> = {
  admin:      'bg-purple-100 text-purple-700',
  staff:      'bg-blue-100 text-blue-700',
  accountant: 'bg-green-100 text-green-700',
};

export default async function UsersPage() {
  await requireRole('admin');

  const res = await pool.query<UserRow>(
    `SELECT u.id, u.name, u.email, u.role,
            COALESCE(u.is_active, TRUE) AS is_active,
            COALESCE(u.base_salary, 0)::numeric AS base_salary,
            u.access_expires_at,
            w.name AS warehouse_name
     FROM users u
     LEFT JOIN warehouses w ON w.id = u.warehouse_id
     ORDER BY u.name`
  );

  const users = res.rows;

  return (
    <div>
      <div className="mb-4">
        <Link href="/settings" className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1">
          ← Back to Settings
        </Link>
      </div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="text-sm text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/settings/users/new" className="btn-primary">+ Add User</Link>
      </div>

      <div className="card p-0 overflow-hidden">
        {users.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">No users yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Warehouse</th>
                <th className="px-4 py-3 text-right">Salary ₹/mo</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const expired = u.access_expires_at && new Date(u.access_expires_at) < new Date();
                return (
                  <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ROLE_BADGE[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.warehouse_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {Number(u.base_salary) > 0
                        ? `₹${Number(u.base_salary).toLocaleString('en-IN')}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {u.access_expires_at ? (
                        <span className={expired ? 'text-red-600' : 'text-gray-600'}>
                          {new Date(u.access_expires_at).toLocaleDateString('en-IN')}
                          {expired && ' (expired)'}
                        </span>
                      ) : (
                        <span className="text-gray-300">Permanent</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Link href={`/settings/users/${u.id}/edit`} className="text-xs text-blue-600 hover:underline">
                        Edit
                      </Link>
                      <ConfirmForm
                        action={toggleUserActiveAction.bind(null, u.id, !u.is_active)}
                        message={u.is_active
                          ? `Deactivate ${u.name}? They will not be able to log in.`
                          : `Reactivate ${u.name}?`}
                        className="inline"
                      >
                        <button type="submit" className={`text-xs hover:underline ${u.is_active ? 'text-red-500' : 'text-green-600'}`}>
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </ConfirmForm>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
