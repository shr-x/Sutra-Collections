import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import DeleteUserButton from './_delete-button';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  warehouse_name: string | null;
  created_at: string;
  access_expires_at: string | null;
}

export default async function UsersPage() {
  await requireSA();

  const res = await query<UserRow>(`
    SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.access_expires_at,
           w.name AS warehouse_name
    FROM users u
    LEFT JOIN warehouses w ON w.id = u.warehouse_id
    ORDER BY u.created_at DESC
  `);

  const users = res.rows;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Regular Users</h1>
        <Link
          href="/sa-console-x7k2/users/new"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New User
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-800 text-xs uppercase text-gray-500">
            <tr>
              {['Name', 'Email', 'Role', 'Warehouse', 'Active', 'Expires', 'Created', 'Actions'].map(
                (h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-900">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium text-white">{u.name}</td>
                <td className="px-4 py-3 text-gray-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">{u.role}</span>
                </td>
                <td className="px-4 py-3 text-gray-400">{u.warehouse_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${u.is_active ? 'text-green-400' : 'text-red-400'}`}>
                    {u.is_active ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {u.access_expires_at
                    ? new Date(u.access_expires_at).toLocaleDateString('en-IN')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(u.created_at).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/sa-console-x7k2/users/${u.id}/edit`}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Edit
                    </Link>
                    <DeleteUserButton userId={u.id} userName={u.name} />
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-600">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
