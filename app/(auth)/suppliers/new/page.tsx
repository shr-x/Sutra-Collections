import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { createSupplierAction } from '../actions';
import SupplierForm from '../supplier-form';

export const metadata: Metadata = { title: 'New Supplier' };

export default async function NewSupplierPage() {
  await requireRole('admin');
  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/suppliers" className="text-sm text-purple-600 hover:underline">← Suppliers</Link>
          <h1 className="page-title mt-1">New Supplier</h1>
        </div>
      </div>
      <div className="card">
        <SupplierForm action={createSupplierAction} cancelHref="/suppliers" />
      </div>
    </div>
  );
}
