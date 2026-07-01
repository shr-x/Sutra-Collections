import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import SearchInput from '@/components/search-input';
import type { InvoiceStatus } from '@/types';

export const metadata: Metadata = { title: 'Sales Invoices' };

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  issued: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  partially_paid: 'bg-yellow-100 text-yellow-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400 line-through',
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  await requireRole('admin', 'staff');

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (searchParams.q) {
    params.push(`%${searchParams.q.trim()}%`);
    conditions.push(`(i.invoice_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }
  if (searchParams.status) {
    params.push(searchParams.status);
    conditions.push(`i.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await query(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.status,
            i.grand_total, i.amount_paid, i.payment_mode,
            c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     ${where}
     ORDER BY i.invoice_date DESC, i.created_at DESC
     LIMIT 200`,
    params
  );

  const rows = res.rows;
  const statuses: InvoiceStatus[] = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Sales Invoices</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link href="/billing/import" className="btn-secondary min-h-[44px]">↑ Import</Link>
          <Link href="/billing/invoices/new" className="btn-primary min-h-[44px]">+ New Invoice</Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search by number or customer…" />
        <div className="flex flex-wrap gap-1.5 text-sm">
          <Link
            href="/billing/invoices"
            className={`rounded-full px-3 py-1 text-xs font-medium ${!searchParams.status ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </Link>
          {statuses.map((s) => (
            <Link
              key={s}
              href={`/billing/invoices?status=${s}`}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${searchParams.status === s ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {s.replace('_', ' ')}
            </Link>
          ))}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            No invoices found.{' '}
            <Link href="/billing/invoices/new" className="text-purple-600 underline">Create one →</Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap sticky left-0 z-10 bg-gray-50">Invoice #</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Customer</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Total</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Paid</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Balance</th>
                <th className="px-4 py-3 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const balance = Number(row.grand_total) - Number(row.amount_paid);
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 sticky left-0 z-10 bg-white">
                      <Link href={`/billing/invoices/${row.id}`} className="font-mono text-xs font-semibold text-purple-700 hover:underline">
                        {row.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                      {new Date(row.invoice_date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      {row.customer_name ?? <span className="text-gray-400 italic">Walk-in</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[row.status as InvoiceStatus]}`}>
                        {(row.status as string).replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatInr(Number(row.grand_total))}</td>
                    <td className="px-4 py-3 text-right text-green-700 whitespace-nowrap">{formatInr(Number(row.amount_paid))}</td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {balance > 0 ? formatInr(balance) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/billing/invoices/${row.id}`} className="text-xs text-purple-600 hover:underline">View →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
