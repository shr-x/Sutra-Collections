import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import SearchInput from '@/components/search-input';

export const metadata: Metadata = { title: 'Quotations' };

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  expired: 'bg-gray-100 text-gray-400',
  converted: 'bg-purple-100 text-purple-700',
};

export default async function QuotationsPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  await requireRole('admin');

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (searchParams.q) { params.push(`%${searchParams.q.trim()}%`); conditions.push(`(q.quotation_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`); }
  if (searchParams.status) { params.push(searchParams.status); conditions.push(`q.status = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await query(
    `SELECT q.id, q.quotation_number, q.created_at, q.valid_until, q.status, q.grand_total, c.name AS customer_name
     FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id ${where}
     ORDER BY q.created_at DESC LIMIT 200`, params
  );

  const statuses = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Quotations</h1>
        <Link href="/billing/quotations/new" className="btn-primary">+ New Quotation</Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <SearchInput placeholder="Search…" />
        <div className="flex flex-wrap gap-1.5">
          <Link href="/billing/quotations" className={`rounded-full px-3 py-1 text-xs font-medium ${!searchParams.status ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>All</Link>
          {statuses.map((s) => (
            <Link key={s} href={`/billing/quotations?status=${s}`} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${searchParams.status === s ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s}
            </Link>
          ))}
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        {res.rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">No quotations yet. <Link href="/billing/quotations/new" className="text-purple-600 underline">Create one →</Link></p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">Number</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Customer</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Valid Until</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Total</th>
                <th className="px-4 py-3 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {res.rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-purple-700 whitespace-nowrap">
                    <Link href={`/billing/quotations/${row.id}`} className="hover:underline">{row.quotation_number}</Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">{row.customer_name ?? <span className="italic text-gray-400">Walk-in</span>}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{row.valid_until ? new Date(row.valid_until).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[row.status] ?? ''}`}>{row.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatInr(Number(row.grand_total))}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/billing/quotations/${row.id}`} className="text-xs text-purple-600 hover:underline">View →</Link>
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
