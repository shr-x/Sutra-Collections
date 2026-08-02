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

  // "outstanding" is a pure invoice-balance figure across ALL issued invoices
  // (POS and tailoring alike), identical to the Outstanding Dues report/page.
  // Tailoring-generated invoices are included because recordTailoringPaymentAction
  // now keeps their amount_paid/status in lockstep with the order's payments
  // (see syncPaymentToInvoices), so they no longer go stale — meaning this
  // number stays consistent with each tailoring order's own balance without
  // needing a separate tailoring_orders.credit_amount term (which used to be
  // added here as a workaround and risked double-counting the same debt).
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
        <div className="flex flex-wrap gap-2">
          <Link href={toggleHref} className="btn-secondary btn-sm">
            {showDeleted ? 'Active' : 'Deleted'}
          </Link>
          {!showDeleted && (
            <>
              <Link href="/customers/import" className="btn-secondary btn-sm">↑ Import</Link>
              <Link href="/customers/new" className="btn-primary btn-sm">+ New Customer</Link>
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
          <>
            {/* ── Mobile: stacked cards (< sm) ───────────────────────────── */}
            <div className="sm:hidden divide-y divide-gray-100">
              {customers.map((c) => (
                <div key={c.id} className={`p-4 ${showDeleted ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {c.phone ?? <span className="badge-gray">Walk-in</span>}
                      </p>
                      {c.gstin && (
                        <p className="mt-0.5 font-mono text-xs text-gray-400">{c.gstin}</p>
                      )}
                      {!showDeleted && Number(c.outstanding) > 0 && (
                        <p className="mt-1 text-xs font-semibold text-red-600">
                          Due: {formatInr(Number(c.outstanding))}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!showDeleted && (
                        <>
                          <Link href={`/customers/${c.id}`} className="btn-ghost btn-sm">View</Link>
                          <Link href={`/customers/${c.id}/edit`} className="btn-ghost btn-sm">Edit</Link>
                        </>
                      )}
                      {session.role === 'admin' && (
                        showDeleted ? (
                          <ConfirmForm action={restoreCustomerAction} message={`Restore "${c.name}"?`} className="inline">
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="btn-ghost btn-sm text-green-600 hover:bg-green-50">Restore</button>
                          </ConfirmForm>
                        ) : (
                          <ConfirmForm action={softDeleteCustomerAction} message={`Delete "${c.name}"? Data is preserved.`} className="inline">
                            <input type="hidden" name="id" value={c.id} />
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
                          <span className="badge-gray">Walk-in</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{c.gstin || '—'}</td>
                      {!showDeleted && (
                        <td className={`px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap ${Number(c.outstanding) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {Number(c.outstanding) > 0 ? formatInr(Number(c.outstanding)) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {!showDeleted && (
                          <>
                            <Link href={`/customers/${c.id}`} className="btn-ghost btn-sm">View</Link>
                            <Link href={`/customers/${c.id}/edit`} className="btn-ghost btn-sm ml-1">Edit</Link>
                          </>
                        )}
                        {session.role === 'admin' && (
                          showDeleted ? (
                            <ConfirmForm action={restoreCustomerAction} message={`Restore "${c.name}"?`} className="inline">
                              <input type="hidden" name="id" value={c.id} />
                              <button type="submit" className="btn-ghost btn-sm text-green-600 hover:bg-green-50 ml-1">Restore</button>
                            </ConfirmForm>
                          ) : (
                            <ConfirmForm action={softDeleteCustomerAction} message={`Delete "${c.name}"? Data is preserved.`} className="inline">
                              <input type="hidden" name="id" value={c.id} />
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
