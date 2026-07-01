import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import SuppliersImportForm from './suppliers-import-form';

export const metadata: Metadata = { title: 'Import Suppliers' };

export default async function SuppliersImportPage() {
  await requireRole('admin');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Suppliers</h1>
          <p className="text-sm text-gray-500">Upload a file and let Gemini AI extract supplier records</p>
        </div>
        <Link href="/suppliers" className="btn-secondary">← Back to Suppliers</Link>
      </div>

      <SuppliersImportForm />
    </div>
  );
}
