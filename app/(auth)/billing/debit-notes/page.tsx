import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import SearchInput from '@/components/search-input';

export const metadata: Metadata = { title: 'Debit Notes' };

export default async function DebitNotesPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireRole('admin');

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (searchParams.q) { params.push(`%${searchParams.q.trim()}%`); conditions.push(`(dn.debit_note_number ILIKE $${params.length} OR s.name ILIKE $${params.length})`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await query(
    `SELECT dn.id, dn.debit_note_number, dn.created_at, dn.status, dn.grand_total, dn.reduces_itc, s.name AS supplier_name
     FROM debit_notes dn JOIN suppliers s ON s.id=dn.supplier_id ${where}
     ORDER BY dn.created_at DESC LIMIT 200`, params
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Debit Notes</h1>
        <Link href="/billing/debit-notes/new" className="btn-primary">+ New Debit Note</Link>
      </div>
      <div className="mb-4"><SearchInput placeholder="Search…" /></div>
      <div className="card p-0 overflow-hidden">
        {res.rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">No debit notes. <Link href="/billing/debit-notes/new" className="text-purple-600 underline">Create one →</Link></p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">DN #</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Supplier</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">ITC Impact</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                <th className="px-4 py-3 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {res.rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-purple-700 whitespace-nowrap"><Link href={`/billing/debit-notes/${row.id}`} className="hover:underline">{row.debit_note_number}</Link></td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">{row.supplier_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.status === 'issued' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{row.status}</span></td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{row.reduces_itc ? <span className="text-red-600">Reduces ITC</span> : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatInr(Number(row.grand_total))}</td>
                  <td className="px-4 py-3 text-right"><Link href={`/billing/debit-notes/${row.id}`} className="text-xs text-purple-600 hover:underline">View →</Link></td>
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
