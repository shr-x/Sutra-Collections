import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { updateSupplierAction } from '../../actions';
import SupplierForm from '../../supplier-form';
import type { Supplier } from '@/types';

export const metadata: Metadata = { title: 'Edit Supplier' };

export default async function EditSupplierPage({ params }: { params: { id: string } }) {
  await requireRole('admin');
  const { rows } = await query<Supplier>('SELECT * FROM suppliers WHERE id=$1', [params.id]);
  if (!rows[0]) notFound();
  const action = updateSupplierAction.bind(null, params.id);

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href={`/suppliers/${params.id}`} className="text-sm text-purple-600 hover:underline">← {rows[0].name}</Link>
          <h1 className="page-title mt-1">Edit Supplier</h1>
        </div>
      </div>
      <div className="card">
        <SupplierForm action={action} defaultValues={rows[0]} cancelHref={`/suppliers/${params.id}`} />
      </div>
    </div>
  );
}
