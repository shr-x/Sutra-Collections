import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import DatePicker from '@/components/date-picker';

export const metadata: Metadata = { title: 'Journal' };

interface JournalEntry {
  id: string;
  entry_date: string;
  description: string;
  reference_type: string | null;
  is_manual: boolean;
  total_debit: number;
  created_at: string;
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; page?: string };
}) {
  await requireRole('accountant', 'admin');

  const page  = Math.max(1, parseInt(searchParams.page ?? '1'));
  const limit = 50;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (searchParams.from) { params.push(searchParams.from); conditions.push(`je.entry_date >= $${params.length}`); }
  if (searchParams.to)   { params.push(searchParams.to);   conditions.push(`je.entry_date <= $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, offset);
  const res = await pool.query<JournalEntry>(
    `SELECT je.id, je.entry_date, je.description, je.reference_type, je.is_manual,
            COALESCE(SUM(jl.debit_amount), 0) AS total_debit,
            je.created_at
     FROM journal_entries je
     LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
     ${where}
     GROUP BY je.id
     ORDER BY je.entry_date DESC, je.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const rows = res.rows.map((r) => ({ ...r, total_debit: Number(r.total_debit) }));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Journal</h1>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/reports/export/journal?format=json${searchParams.from ? `&from=${searchParams.from}` : ''}${searchParams.to ? `&to=${searchParams.to}` : ''}`}
            className="btn-secondary btn-sm"
            download
          >
            Export JSON
          </a>
          <a
            href={`/api/accounting/journal/pdf?${searchParams.from ? `from=${searchParams.from}&` : ''}${searchParams.to ? `to=${searchParams.to}` : ''}`}
            className="btn-secondary btn-sm"
            download
          >
            Export PDF
          </a>
          <Link href="/accounting/journal/new" className="btn-primary btn-sm">+ New Entry</Link>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">📅 From</label>
          <DatePicker name="from" defaultValue={searchParams.from} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">📅 To</label>
          <DatePicker name="to" defaultValue={searchParams.to} />
        </div>
        <button type="submit" className="btn-primary btn-sm">Filter</button>
        {(searchParams.from || searchParams.to) && (
          <a href="/accounting/journal" className="btn-ghost btn-sm">Clear</a>
        )}
      </form>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap sticky left-0 z-10 bg-gray-50">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Description</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Type</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">No journal entries found.</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap sticky left-0 z-10 bg-white">
                  {new Date(row.entry_date).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/accounting/journal/${row.id}`}
                    className="font-medium text-purple-700 hover:underline">
                    {row.description}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.is_manual
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {row.is_manual ? 'Manual' : (row.reference_type?.replace('_', ' ') ?? 'Auto')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">
                  ₹{row.total_debit.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex gap-3">
        {page > 1 && (
          <Link href={`?from=${searchParams.from ?? ''}&to=${searchParams.to ?? ''}&page=${page - 1}`}
            className="btn-secondary text-sm">← Prev</Link>
        )}
        {rows.length === limit && (
          <Link href={`?from=${searchParams.from ?? ''}&to=${searchParams.to ?? ''}&page=${page + 1}`}
            className="btn-secondary text-sm">Next →</Link>
        )}
      </div>
    </div>
  );
}
