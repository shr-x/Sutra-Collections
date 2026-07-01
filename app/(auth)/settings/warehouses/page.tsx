import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import ConfirmForm from '@/components/confirm-form';
import { deleteWarehouseAction, activateWarehouseAction } from './actions';
import type { Warehouse } from '@/types';

export const metadata: Metadata = { title: 'Warehouses' };

export default async function WarehousesPage() {
  await requireRole('admin');

  const { rows: warehouses } = await query<Warehouse>(
    'SELECT id, name, address, is_active FROM warehouses ORDER BY name'
  );

  return (
    <div>
      <div className="mb-4">
        <Link href="/settings" className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1">
          ← Back to Settings
        </Link>
      </div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage stock locations</p>
        </div>
        <Link href="/settings/warehouses/new" className="btn-primary">+ New Warehouse</Link>
      </div>

      <div className="card p-0 overflow-hidden">
        {warehouses.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">No warehouses yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">Name</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Address</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Status</th>
                <th className="px-4 py-3 whitespace-nowrap" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {warehouses.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{w.name}</td>
                  <td className="px-4 py-3 text-gray-500">{w.address || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      w.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {w.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/settings/warehouses/${w.id}/edit`}
                      className="rounded px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50"
                    >
                      Edit
                    </Link>
                    {w.is_active ? (
                      <ConfirmForm
                        action={deleteWarehouseAction}
                        message={`Deactivate "${w.name}"? Staff assigned here will lose access.`}
                        className="inline"
                      >
                        <input type="hidden" name="id" value={w.id} />
                        <button type="submit" className="ml-2 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                          Deactivate
                        </button>
                      </ConfirmForm>
                    ) : (
                      <form action={activateWarehouseAction} className="inline">
                        <input type="hidden" name="id" value={w.id} />
                        <button type="submit" className="ml-2 rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50">
                          Activate
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
