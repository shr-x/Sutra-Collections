import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import SearchInput from '@/components/search-input';
import PurchaseAiImport from '@/components/purchase-ai-import';

export const metadata: Metadata = { title: 'Purchase Invoices' };

export default async function PurchasesPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireRole('admin');

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (searchParams.q) {
    params.push(`%${searchParams.q.trim()}%`);
    conditions.push(`(p.purchase_number ILIKE $${params.length} OR s.name ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await query(
    `SELECT p.id, p.purchase_number, p.purchase_date, p.grand_total, p.include_in_gst, s.name AS supplier_name
     FROM purchase_invoices p JOIN suppliers s ON s.id=p.supplier_id ${where}
     ORDER BY p.purchase_date DESC LIMIT 200`,
    params
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Purchase Invoices</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          <PurchaseAiImport />
          <Link href="/billing/purchases/new" className="btn-primary min-h-[44px]">+ New Purchase</Link>
        </div>
      </div>
      <div className="mb-4">
        <SearchInput placeholder="Search by number or supplier…" />
      </div>
      <div className="card p-0 overflow-hidden">
        {res.rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            No purchase invoices. <Link href="/billing/purchases/new" className="text-purple-600 underline">Create one →</Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap sticky left-0 z-10 bg-gray-50">PUR #</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Supplier</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">ITC</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Total</th>
                <th className="px-4 py-3 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {res.rows.map((row) => {
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-purple-700 whitespace-nowrap sticky left-0 z-10 bg-white">
                      <Link href={`/billing/purchases/${row.id}`} className="hover:underline">{row.purchase_number}</Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(row.purchase_date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3">{row.supplier_name}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {row.include_in_gst ? <span className="text-green-700">✓ ITC</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatInr(Number(row.grand_total))}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/billing/purchases/${row.id}`} className="text-xs text-purple-600 hover:underline">View →</Link>
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
