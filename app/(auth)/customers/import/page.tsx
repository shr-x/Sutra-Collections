import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import CustomersImportForm from './customers-import-form';

export const metadata: Metadata = { title: 'Import Customers' };

export default async function CustomersImportPage() {
  await requireRole('admin');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Customers</h1>
          <p className="text-sm text-gray-500">Upload a file and let Gemini AI extract customer records</p>
        </div>
        <Link href="/customers" className="btn-secondary">← Back to Customers</Link>
      </div>

      <CustomersImportForm />
    </div>
  );
}
