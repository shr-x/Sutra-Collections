import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { createWarehouseAction } from '../actions';
import WarehouseForm from '../warehouse-form';

export const metadata: Metadata = { title: 'New Warehouse' };

export default async function NewWarehousePage() {
  await requireRole('admin');
  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/settings/warehouses" className="text-sm text-purple-600 hover:underline">← Warehouses</Link>
          <h1 className="page-title mt-1">New Warehouse</h1>
        </div>
      </div>
      <div className="card">
        <WarehouseForm action={createWarehouseAction} />
      </div>
    </div>
  );
}
