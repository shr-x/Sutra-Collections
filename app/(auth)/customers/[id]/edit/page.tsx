import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { updateCustomerAction } from '../../actions';
import CustomerForm from '../../customer-form';
import type { Customer } from '@/types';

export const metadata: Metadata = { title: 'Edit Customer' };

export default async function EditCustomerPage({ params }: { params: { id: string } }) {
  const session = await requireRole('admin');

  const { rows } = await query<Customer>('SELECT * FROM customers WHERE id=$1', [params.id]);
  if (!rows[0]) notFound();

  const boundAction = updateCustomerAction.bind(null, params.id);

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href={`/customers/${params.id}`} className="text-sm text-purple-600 hover:underline">
            ← {rows[0].name}
          </Link>
          <h1 className="page-title mt-1">Edit Customer</h1>
        </div>
      </div>
      <div className="card">
        <CustomerForm
          action={boundAction}
          defaultValues={rows[0]}
          isAdmin={session.role === 'admin'}
          cancelHref={`/customers/${params.id}`}
        />
      </div>
    </div>
  );
}
