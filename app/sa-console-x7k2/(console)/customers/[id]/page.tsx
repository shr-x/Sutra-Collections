import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  credit_limit: string;
  loyalty_points_balance: string;
  deleted_at: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  grand_total: string;
  amount_paid: string;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireSA();

  const [custRes, invRes] = await Promise.all([
    query<Customer>(`SELECT * FROM customers WHERE id=$1`, [params.id]),
    query<Invoice>(
      `SELECT id, invoice_number, invoice_date, status, grand_total, amount_paid
       FROM invoices WHERE customer_id=$1 ORDER BY invoice_date DESC`,
      [params.id]
    ),
  ]);

  const customer = custRes.rows[0];
  if (!customer) notFound();

  const invoices = invRes.rows;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">{customer.name}</h1>
          {customer.deleted_at && (
            <span className="mt-1 inline-block rounded bg-red-900/40 px-2 py-0.5 text-xs text-red-300 border border-red-700">
              Deleted
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/sa-console-x7k2/customers/${customer.id}/edit`}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Edit
          </Link>
          <Link
            href="/sa-console-x7k2/customers"
            className="text-sm text-gray-400 hover:text-gray-300"
          >
            Back to list
          </Link>
        </div>
      </div>

      {/* Customer details */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-400">Details</h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-gray-500">Phone</dt>
            <dd className="mt-0.5 text-sm text-gray-300">{customer.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">GSTIN</dt>
            <dd className="mt-0.5 text-sm text-gray-300">{customer.gstin ?? '—'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-gray-500">Address</dt>
            <dd className="mt-0.5 text-sm text-gray-300">{customer.address || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Credit Limit</dt>
            <dd className="mt-0.5 text-sm text-gray-300">
              ₹{Number(customer.credit_limit).toLocaleString('en-IN')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Loyalty Points</dt>
            <dd className="mt-0.5 text-sm text-gray-300">
              {Number(customer.loyalty_points_balance).toLocaleString('en-IN')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Created</dt>
            <dd className="mt-0.5 text-sm text-gray-300">
              {new Date(customer.created_at).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            </dd>
          </div>
        </dl>
      </div>

      {/* Invoices */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700">
          <h2 className="text-sm font-medium text-white">Invoices ({invoices.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-700/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Invoice #</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Total</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Paid</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Balance</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No invoices yet.
                </td>
              </tr>
            )}
            {invoices.map((inv) => {
              const total = Number(inv.grand_total);
              const paid = Number(inv.amount_paid);
              return (
                <tr key={inv.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-gray-300">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {new Date(inv.invoice_date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      inv.status === 'paid' ? 'bg-green-900/40 text-green-300 border border-green-700' :
                      inv.status === 'cancelled' ? 'bg-gray-700 text-gray-400' :
                      'bg-yellow-900/40 text-yellow-300 border border-yellow-700'
                    }`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    ₹{total.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    ₹{paid.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    ₹{(total - paid).toLocaleString('en-IN')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
