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
        <div className="flex flex-wrap gap-2">
          <Link href={toggleHref} className="btn-secondary btn-sm">
            {showDeleted ? 'Active' : 'Deleted'}
          </Link>
          {!showDeleted && (
            <>
              <Link href="/suppliers/import" className="btn-secondary btn-sm">↑ Import</Link>
              <Link href="/suppliers/new" className="btn-primary btn-sm">+ New Supplier</Link>
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
          <>
            {/* ── Mobile: stacked cards (< sm) ───────────────────────────── */}
            <div className="sm:hidden divide-y divide-gray-100">
              {suppliers.map((s) => (
                <div key={s.id} className={`p-4 ${showDeleted ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{s.name}</p>
                      {s.phone && <p className="mt-0.5 text-xs text-gray-500">{s.phone}</p>}
                      {s.gstin && <p className="mt-0.5 font-mono text-xs text-gray-400">{s.gstin}</p>}
                      {s.address && <p className="mt-0.5 text-xs text-gray-400 truncate">{s.address}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!showDeleted && (
                        <>
                          <Link href={`/suppliers/${s.id}`} className="btn-ghost btn-sm">View</Link>
                          <Link href={`/suppliers/${s.id}/edit`} className="btn-ghost btn-sm">Edit</Link>
                        </>
                      )}
                      {session.role === 'admin' && (
                        showDeleted ? (
                          <ConfirmForm action={restoreSupplierAction} message={`Restore "${s.name}"?`} className="inline">
                            <input type="hidden" name="id" value={s.id} />
                            <button type="submit" className="btn-ghost btn-sm text-green-600 hover:bg-green-50">Restore</button>
                          </ConfirmForm>
                        ) : (
                          <ConfirmForm action={softDeleteSupplierAction} message={`Delete "${s.name}"? Data is preserved.`} className="inline">
                            <input type="hidden" name="id" value={s.id} />
                            <button type="submit" className="btn-ghost btn-sm text-red-600 hover:bg-red-50">Delete</button>
                          </ConfirmForm>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Desktop: table (≥ sm) ───────────────────────────────────── */}
            <div className="hidden sm:block overflow-x-auto">
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
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.phone ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.gstin || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{s.address || '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {!showDeleted && (
                          <>
                            <Link href={`/suppliers/${s.id}`} className="btn-ghost btn-sm">View</Link>
                            <Link href={`/suppliers/${s.id}/edit`} className="btn-ghost btn-sm ml-1">Edit</Link>
                          </>
                        )}
                        {session.role === 'admin' && (
                          showDeleted ? (
                            <ConfirmForm action={restoreSupplierAction} message={`Restore "${s.name}"?`} className="inline">
                              <input type="hidden" name="id" value={s.id} />
                              <button type="submit" className="btn-ghost btn-sm text-green-600 hover:bg-green-50 ml-1">Restore</button>
                            </ConfirmForm>
                          ) : (
                            <ConfirmForm action={softDeleteSupplierAction} message={`Delete "${s.name}"? Data is preserved.`} className="inline">
                              <input type="hidden" name="id" value={s.id} />
                              <button type="submit" className="btn-ghost btn-sm text-red-600 hover:bg-red-50 ml-1">Delete</button>
                            </ConfirmForm>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
