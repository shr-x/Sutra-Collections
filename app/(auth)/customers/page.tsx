import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import SearchInput from '@/components/search-input';
import ConfirmForm from '@/components/confirm-form';
import { softDeleteCustomerAction, restoreCustomerAction } from './actions';
import type { Customer } from '@/types';

export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { q?: string; deleted?: string };
}) {
  const session = await requireRole('admin');
  const q = searchParams.q?.trim();
  const showDeleted = searchParams.deleted === '1';

  const deletedFilter = showDeleted ? 'c.deleted_at IS NOT NULL' : 'c.deleted_at IS NULL';
  const searchFilter = q ? `AND (c.name ILIKE $1 OR c.phone ILIKE $1)` : '';

  const { rows: customers } = await query<Customer & { outstanding: string }>(
    `SELECT c.id, c.name, c.phone, c.address, c.gstin, c.created_at,
            COALESCE((SELECT SUM(grand_total - amount_paid) FROM invoices
                      WHERE customer_id = c.id AND status IN ('issued','partially_paid')
                        AND grand_total > amount_paid), 0)::numeric AS outstanding
     FROM customers c
     WHERE ${deletedFilter} ${searchFilter}
     ORDER BY c.name LIMIT 200`,
    q ? [`%${q}%`] : []
  );

  const toggleHref = showDeleted ? '/customers' : '/customers?deleted=1';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{showDeleted ? 'Deleted Customers' : 'Customers'}</h1>
          <p className="text-sm text-gray-500">{customers.length} result{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <Link href={toggleHref} className="btn-secondary">
            {showDeleted ? 'Active' : 'Deleted'}
          </Link>
          {!showDeleted && (
            <>
              <Link href="/customers/import" className="btn-secondary">↑ Import</Link>
              <Link href="/customers/new" className="btn-primary">+ New Customer</Link>
            </>
          )}
        </div>
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Search by name or phone…" />
      </div>

      <div className="card p-0 overflow-hidden">
        {customers.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            {q
              ? 'No customers match your search.'
              : showDeleted ? 'No deleted customers.' : 'No customers yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap sticky left-0 z-10 bg-gray-50">Name</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Phone</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">GSTIN</th>
                {!showDeleted && <th className="px-4 py-3 text-right whitespace-nowrap">Outstanding</th>}
                <th className="px-4 py-3 whitespace-nowrap" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => (
                <tr key={c.id} className={`hover:bg-gray-50${showDeleted ? ' opacity-60' : ''}`}>
                  <td className="px-4 py-3 sticky left-0 z-10 bg-white">
                    <div className="font-medium text-gray-900">{c.name}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {c.phone || (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        Walk-in
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{c.gstin || '—'}</td>
                  {!showDeleted && (
                    <td className={`px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap ${Number(c.outstanding) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {Number(c.outstanding) > 0 ? formatInr(Number(c.outstanding)) : '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    {!showDeleted && (
                      <>
                        <Link
                          href={`/customers/${c.id}`}
                          className="inline-flex items-center rounded px-2 min-h-[44px] text-xs font-medium text-purple-600 hover:bg-purple-50"
                        >
                          View
                        </Link>
                        <Link
                          href={`/customers/${c.id}/edit`}
                          className="ml-1 inline-flex items-center rounded px-2 min-h-[44px] text-xs font-medium text-gray-600 hover:bg-gray-100"
                        >
                          Edit
                        </Link>
                      </>
                    )}
                    {session.role === 'admin' && (
                      showDeleted ? (
                        <ConfirmForm
                          action={restoreCustomerAction}
                          message={`Restore "${c.name}"?`}
                          className="inline"
                        >
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            className="ml-1 inline-flex items-center rounded px-2 min-h-[44px] text-xs font-medium text-green-600 hover:bg-green-50"
                          >
                            Restore
                          </button>
                        </ConfirmForm>
                      ) : (
                        <ConfirmForm
                          action={softDeleteCustomerAction}
                          message={`Delete "${c.name}"? They will be hidden but data is preserved.`}
                          className="inline"
                        >
                          <input type="hidden" name="id" value={c.id} />
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
