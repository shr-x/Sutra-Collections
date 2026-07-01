import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { updateWarehouseAction } from '../../actions';
import WarehouseForm from '../../warehouse-form';
import type { Warehouse } from '@/types';

export const metadata: Metadata = { title: 'Edit Warehouse' };

export default async function EditWarehousePage({ params }: { params: { id: string } }) {
  await requireRole('admin');

  const { rows } = await query<Warehouse>('SELECT * FROM warehouses WHERE id=$1', [params.id]);
  if (!rows[0]) notFound();

  const boundAction = updateWarehouseAction.bind(null, params.id);

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/settings/warehouses" className="text-sm text-purple-600 hover:underline">← Warehouses</Link>
          <h1 className="page-title mt-1">Edit Warehouse</h1>
        </div>
      </div>
      <div className="card">
        <WarehouseForm action={boundAction} defaultValues={rows[0]} />
      </div>
    </div>
  );
}
