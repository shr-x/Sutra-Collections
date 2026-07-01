import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import SearchInput from '@/components/search-input';

export const metadata: Metadata = { title: 'Refunds' };

const BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', issued: 'bg-amber-100 text-amber-700', settled: 'bg-green-100 text-green-700',
};

export default async function CreditNotesPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  await requireRole('admin', 'staff');

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (searchParams.q) { params.push(`%${searchParams.q.trim()}%`); conditions.push(`(cn.credit_note_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`); }
  if (searchParams.status) { params.push(searchParams.status); conditions.push(`cn.status=$${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await query(
    `SELECT cn.id, cn.credit_note_number, cn.created_at, cn.status, cn.grand_total, cn.resolution, c.name AS customer_name
     FROM credit_notes cn LEFT JOIN customers c ON c.id=cn.customer_id ${where}
     ORDER BY cn.created_at DESC LIMIT 200`, params
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Refunds</h1>
        <Link href="/billing/credit-notes/new" className="btn-primary">+ New Refund</Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <SearchInput placeholder="Search…" />
        <div className="flex gap-1.5">
          {['issued', 'settled'].map((s) => (
            <Link key={s} href={`/billing/credit-notes?status=${s}`} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${searchParams.status === s ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s}</Link>
          ))}
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        {res.rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">No refunds yet. <Link href="/billing/credit-notes/new" className="text-purple-600 underline">Create one →</Link></p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">CN #</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Customer</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Resolution</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                <th className="px-4 py-3 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {res.rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-purple-700 whitespace-nowrap"><Link href={`/billing/credit-notes/${row.id}`} className="hover:underline">{row.credit_note_number}</Link></td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">{row.customer_name ?? <span className="italic text-gray-400">Walk-in</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[row.status] ?? ''}`}>{row.status}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500 capitalize">{row.resolution ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatInr(Number(row.grand_total))}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/billing/credit-notes/${row.id}`} className="text-xs text-purple-600 hover:underline">View →</Link></td>
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
