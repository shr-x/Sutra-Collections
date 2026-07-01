import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';

export const metadata: Metadata = { title: 'Journal Entry' };

interface JournalEntryRow {
  id: string;
  entry_date: string;
  description: string;
  reference_type: string | null;
  reference_id: string | null;
  is_manual: boolean;
  created_at: string;
}

interface JournalLineRow {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  debit_amount: number;
  credit_amount: number;
}

export default async function JournalEntryDetailPage({ params }: { params: { id: string } }) {
  await requireRole('accountant', 'admin');

  const [entryRes, linesRes] = await Promise.all([
    pool.query<JournalEntryRow>(`SELECT * FROM journal_entries WHERE id = $1`, [params.id]),
    pool.query<JournalLineRow>(
      `SELECT jl.id, a.account_code, a.account_name, a.account_type,
              jl.debit_amount, jl.credit_amount
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.journal_entry_id = $1
       ORDER BY jl.debit_amount DESC`,
      [params.id]
    ),
  ]);

  if (!entryRes.rows[0]) notFound();
  const entry = entryRes.rows[0];
  const lines = linesRes.rows.map((r) => ({
    ...r,
    debit_amount:  Number(r.debit_amount),
    credit_amount: Number(r.credit_amount),
  }));

  const totalDebit  = lines.reduce((s, l) => s + l.debit_amount, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit_amount, 0);

  const refLink = entry.reference_type && entry.reference_id
    ? {
        invoice:     `/billing/invoices/${entry.reference_id}`,
        payment:     `/billing/invoices/${entry.reference_id}`,
        purchase:    `/billing/purchases/${entry.reference_id}`,
        credit_note: `/billing/credit-notes/${entry.reference_id}`,
        debit_note:  `/billing/debit-notes/${entry.reference_id}`,
        expense:     `/accounting/expenses`,
      }[entry.reference_type]
    : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/accounting/journal" className="text-sm text-gray-500 hover:underline">← Journal</Link>
          <h1 className="page-title mt-1">{entry.description}</h1>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          ['Date', new Date(entry.entry_date).toLocaleDateString('en-IN')],
          ['Type', entry.is_manual ? 'Manual' : (entry.reference_type?.replace('_', ' ') ?? 'Auto')],
          ['Total Debit', `₹${totalDebit.toFixed(2)}`],
          ['Balanced', totalDebit === totalCredit ? 'Yes' : 'No'],
        ].map(([k, v]) => (
          <div key={k} className="card py-3">
            <p className="text-xs text-gray-500">{k}</p>
            <p className="mt-0.5 font-semibold text-gray-800">{v}</p>
          </div>
        ))}
      </div>

      {refLink && (
        <div className="mb-4">
          <Link href={refLink} className="text-sm text-purple-600 hover:underline">
            View source document →
          </Link>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Account</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Type</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Debit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-800">{l.account_code}</span>
                  <span className="ml-2 text-gray-500">{l.account_name}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 capitalize">{l.account_type}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                  {l.debit_amount > 0 ? `₹${l.debit_amount.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                  {l.credit_amount > 0 ? `₹${l.credit_amount.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 font-semibold bg-gray-50">
            <tr>
              <td className="px-4 py-3 text-sm" colSpan={2}>Totals</td>
              <td className="px-4 py-3 text-right tabular-nums">₹{totalDebit.toFixed(2)}</td>
              <td className="px-4 py-3 text-right tabular-nums">₹{totalCredit.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
