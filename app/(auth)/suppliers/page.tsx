import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import SearchInput from '@/components/search-input';
import ConfirmForm from '@/components/confirm-form';
import { softDeleteSupplierAction, restoreSupplierAction } from './actions';
import type { Supplier } from '@/types';

export const metadata: Metadata = { title: 'Suppliers' };

export default async function SuppliersPage({ searchParams }: { searchParams: { q?: string; deleted?: string } }) {
  const session = await requireRole('admin');
  const q = searchParams.q?.trim();
  const showDeleted = searchParams.deleted === '1';

  const deletedFilter = showDeleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL';
  const searchFilter = q ? `AND (name ILIKE $1 OR phone ILIKE $1)` : '';

  const { rows: suppliers } = await query<Supplier>(
    `SELECT id,name,phone,gstin,address FROM suppliers
     WHERE ${deletedFilter} ${searchFilter}
     ORDER BY name LIMIT 200`,
    q ? [`%${q}%`] : []
  );

  const toggleHref = showDeleted ? '/suppliers' : '/suppliers?deleted=1';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{showDeleted ? 'Deleted Suppliers' : 'Suppliers'}</h1>
          <p className="text-sm text-gray-500">{suppliers.length} result{suppliers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <Link href={toggleHref} className="btn-secondary">
            {showDeleted ? 'Active' : 'Deleted'}
          </Link>
          {!showDeleted && (
            <>
              <Link href="/suppliers/import" className="btn-secondary">↑ Import</Link>
              <Link href="/suppliers/new" className="btn-primary">+ New Supplier</Link>
            </>
          )}
        </div>
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Search by name or phone…" />
      </div>

      <div className="card p-0 overflow-hidden">
        {suppliers.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            {q
              ? 'No suppliers match your search.'
              : showDeleted ? 'No deleted suppliers.' : 'No suppliers yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap sticky left-0 z-10 bg-gray-50">Name</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Phone</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">GSTIN</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Address</th>
                <th className="px-4 py-3 whitespace-nowrap" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suppliers.map((s) => (
                <tr key={s.id} className={`hover:bg-gray-50${showDeleted ? ' opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap sticky left-0 z-10 bg-white">{s.name}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.phone}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.gstin || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{s.address || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {!showDeleted && (
                      <>
                        <Link href={`/suppliers/${s.id}`} className="inline-flex items-center rounded px-2 min-h-[44px] text-xs font-medium text-purple-600 hover:bg-purple-50">View</Link>
                        <Link href={`/suppliers/${s.id}/edit`} className="ml-1 inline-flex items-center rounded px-2 min-h-[44px] text-xs font-medium text-gray-600 hover:bg-gray-100">Edit</Link>
                      </>
                    )}
                    {session.role === 'admin' && (
                      showDeleted ? (
                        <ConfirmForm
                          action={restoreSupplierAction}
                          message={`Restore "${s.name}"?`}
                          className="inline"
                        >
                          <input type="hidden" name="id" value={s.id} />
                          <button
                            type="submit"
                            className="ml-1 inline-flex items-center rounded px-2 min-h-[44px] text-xs font-medium text-green-600 hover:bg-green-50"
                          >
                            Restore
                          </button>
                        </ConfirmForm>
                      ) : (
                        <ConfirmForm
                          action={softDeleteSupplierAction}
                          message={`Delete "${s.name}"? They will be hidden but data is preserved.`}
                          className="inline"
                        >
                          <input type="hidden" name="id" value={s.id} />
                          <button
                            type="submit"
                            className="ml-1 inline-flex items-center rounded px-2 min-h-[44px] text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </ConfirmForm>
                      )
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
