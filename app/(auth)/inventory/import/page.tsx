import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import InventoryImportForm from './inventory-import-form';

export const metadata: Metadata = { title: 'Import Inventory' };

export default async function InventoryImportPage() {
  const session = await requireRole('admin');

  const { rows: warehouses } = await query<{ id: string; name: string }>(
    'SELECT id, name FROM warehouses WHERE is_active = TRUE ORDER BY name'
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Inventory</h1>
          <p className="text-sm text-gray-500">Upload a file and let Gemini AI extract the items</p>
        </div>
        <Link href="/inventory/items" className="btn-secondary">← Back to Items</Link>
      </div>

      <InventoryImportForm
        warehouseId={session.warehouseId ?? null}
        warehouses={warehouses}
      />
    </div>
  );
}
