import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import type { Supplier } from '@/types';

export const metadata: Metadata = { title: 'Supplier' };

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  await requireRole('admin');
  const { rows } = await query<Supplier>('SELECT * FROM suppliers WHERE id=$1', [params.id]);
  if (!rows[0]) notFound();
  const s = rows[0];

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/suppliers" className="text-sm text-purple-600 hover:underline">← Suppliers</Link>
          <h1 className="page-title mt-1">{s.name}</h1>
        </div>
        <Link href={`/suppliers/${s.id}/edit`} className="btn-secondary">Edit</Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card">
          <h2 className="mb-4 font-semibold text-gray-900">Details</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-gray-500">Phone</dt><dd className="font-medium text-gray-900">{s.phone}</dd></div>
            <div><dt className="text-gray-500">GSTIN</dt><dd className="font-mono font-medium text-gray-900">{s.gstin || '—'}</dd></div>
            <div><dt className="text-gray-500">Address</dt><dd className="font-medium text-gray-900">{s.address || '—'}</dd></div>
            <div><dt className="text-gray-500">Added</dt><dd className="text-gray-700">{new Date(s.created_at).toLocaleDateString('en-IN')}</dd></div>
          </dl>
        </div>

        <div className="card col-span-1 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-gray-900">Outstanding Payable</h2>
          <div className="flex flex-col items-center py-12 text-center text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm">Purchase history and outstanding balance will appear here in Phase 3.</p>
            {/* TODO Phase 3: List purchase invoices, payments for this supplier */}
          </div>
        </div>
      </div>
    </div>
  );
}
