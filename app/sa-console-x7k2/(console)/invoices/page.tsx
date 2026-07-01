import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import { CancelInvoiceButton, DeleteInvoiceButton } from './_buttons';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: 'draft' | 'paid' | 'unpaid' | 'cancelled';
  grand_total: string;
  amount_paid: string;
  payment_mode: string | null;
  customer_name: string;
}

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-green-900/50 text-green-400',
  unpaid: 'bg-yellow-900/50 text-yellow-400',
  cancelled: 'bg-red-900/50 text-red-400',
  draft: 'bg-gray-700 text-gray-400',
};

function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function fmtMoney(val: string) {
  return `₹${parseFloat(val).toFixed(2)}`;
}

const VALID_STATUSES = ['paid', 'unpaid', 'cancelled', 'draft'];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { status?: string; from?: string; to?: string };
}) {
  await requireSA();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (searchParams.status && VALID_STATUSES.includes(searchParams.status)) {
    params.push(searchParams.status);
    conditions.push(`i.status = $${params.length}`);
  }
  if (searchParams.from) {
    params.push(searchParams.from);
    conditions.push(`i.invoice_date >= $${params.length}`);
  }
  if (searchParams.to) {
    params.push(searchParams.to);
    conditions.push(`i.invoice_date <= $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await query<InvoiceRow>(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.status, i.grand_total, i.amount_paid,
            i.payment_mode, COALESCE(c.name, 'Walk-in') AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     ${where}
     ORDER BY i.invoice_date DESC, i.invoice_number DESC
     LIMIT 200`,
    params
  );

  const invoices = res.rows;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Invoices</h1>
        <Link
          href="/sa-console-x7k2/invoices/new"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Invoice
        </Link>
      </div>

      {/* Filter bar — GET form, no server action needed */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-700 bg-gray-800 p-4"
      >
        <div>
          <label className="mb-1 block text-xs text-gray-400">Status</label>
          <select
            name="status"
            defaultValue={searchParams.status ?? ''}
            className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="cancelled">Cancelled</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">From</label>
          <input
            type="date"
            name="from"
            defaultValue={searchParams.from ?? ''}
            className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">To</label>
          <input
            type="date"
            name="to"
            defaultValue={searchParams.to ?? ''}
            className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Filter
        </button>
        <Link
          href="/sa-console-x7k2/invoices"
          className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:text-white"
        >
          Clear
        </Link>
      </form>

      <p className="text-xs text-gray-500">
        Showing {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} (max 200)
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-700/50">
            <tr>
              {['Invoice #', 'Date', 'Customer', 'Status', 'Total', 'Paid', 'Balance', 'Mode', 'Actions'].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const balance = parseFloat(inv.grand_total) - parseFloat(inv.amount_paid);
              return (
                <tr key={inv.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium text-white">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-gray-300">{fmtDate(inv.invoice_date)}</td>
                  <td className="px-4 py-3 text-gray-300">{inv.customer_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        STATUS_BADGE[inv.status] ?? 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{fmtMoney(inv.grand_total)}</td>
                  <td className="px-4 py-3 text-gray-300">{fmtMoney(inv.amount_paid)}</td>
                  <td
                    className={`px-4 py-3 ${balance > 0.01 ? 'text-yellow-400' : 'text-gray-300'}`}
                  >
                    {fmtMoney(balance.toFixed(2))}
                  </td>
                  <td className="px-4 py-3 text-gray-400 capitalize">{inv.payment_mode ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/sa-console-x7k2/invoices/${inv.id}`}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        View
                      </Link>
                      <Link
                        href={`/sa-console-x7k2/invoices/${inv.id}/edit`}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Edit
                      </Link>
                      {inv.status !== 'cancelled' && <CancelInvoiceButton id={inv.id} />}
                      <DeleteInvoiceButton id={inv.id} invoiceNumber={inv.invoice_number} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-600">
                  No invoices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
