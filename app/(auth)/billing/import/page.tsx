import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import BillingImportForm from './billing-import-form';

export const metadata: Metadata = { title: 'Import Invoice' };

export default async function BillingImportPage() {
  const session = await requireRole('admin');

  const { rows: warehouses } = await query<{ id: string; name: string }>(
    'SELECT id, name FROM warehouses WHERE is_active = TRUE ORDER BY name'
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Invoice</h1>
          <p className="text-sm text-gray-500">Upload a purchase or sales invoice — Gemini extracts line items automatically</p>
        </div>
        <Link href="/billing/invoices" className="btn-secondary">← Back to Invoices</Link>
      </div>

      <BillingImportForm
        warehouses={warehouses}
        defaultWarehouseId={session.warehouseId ?? null}
      />
    </div>
  );
}
