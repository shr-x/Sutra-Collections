import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import { hardDeleteCustomerAction, restoreSACustomerAction } from './actions';

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  credit_limit: string;
  loyalty_points_balance: string;
  deleted_at: string | null;
  created_at: string;
  invoice_count: string;
  outstanding: string;
}

export default async function SACustomersPage({
  searchParams,
}: {
  searchParams: { showDeleted?: string };
}) {
  await requireSA();

  const showDeleted = searchParams.showDeleted === '1';
  const deletedClause = showDeleted ? '' : 'WHERE c.deleted_at IS NULL';

  const res = await query<CustomerRow>(
    `SELECT c.id, c.name, c.phone, c.address, c.gstin, c.credit_limit, c.loyalty_points_balance,
            c.deleted_at, c.created_at,
            (SELECT COUNT(*) FROM invoices WHERE customer_id = c.id)::text AS invoice_count,
            (SELECT COALESCE(SUM(grand_total - amount_paid), 0) FROM invoices
              WHERE customer_id = c.id AND status != 'cancelled')::text AS outstanding
     FROM customers c
     ${deletedClause}
     ORDER BY c.created_at DESC`
  );

  const customers = res.rows;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Customers</h1>
        <div className="flex items-center gap-3">
          <Link
            href={showDeleted ? '/sa-console-x7k2/customers' : '/sa-console-x7k2/customers?showDeleted=1'}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            {showDeleted ? 'Hide Deleted' : 'Show Deleted'}
          </Link>
          <Link
            href="/sa-console-x7k2/customers/new"
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + New Customer
          </Link>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-700/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">GSTIN</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Credit Limit</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Loyalty Pts</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Outstanding</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Invoices</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  No customers found.
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                <td className="px-4 py-3">
                  <Link
                    href={`/sa-console-x7k2/customers/${c.id}`}
                    className={`text-indigo-400 hover:text-indigo-300 ${c.deleted_at ? 'opacity-60 line-through' : ''}`}
                  >
                    {c.name}
                  </Link>
                  {c.deleted_at && (
                    <span className="ml-2 text-xs text-red-400">deleted</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-300">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-gray-300">{c.gstin ?? '—'}</td>
                <td className="px-4 py-3 text-right text-gray-300">
                  ₹{Number(c.credit_limit).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {Number(c.loyalty_points_balance).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-right text-gray-300">
                  ₹{Number(c.outstanding).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-right text-gray-300">{c.invoice_count}</td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(c.created_at).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/sa-console-x7k2/customers/${c.id}/edit`}
                      className="text-sm text-indigo-400 hover:text-indigo-300"
                    >
                      Edit
                    </Link>
                    {c.deleted_at ? (
                      <form action={restoreSACustomerAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600"
                        >
                          Restore
                        </button>
                      </form>
                    ) : (
                      <form
                        action={hardDeleteCustomerAction}
                      >
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className="rounded bg-red-900 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-800"
                        >
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
