import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { createCustomerAction } from '../actions';
import CustomerForm from '../customer-form';

export const metadata: Metadata = { title: 'New Customer' };

export default async function NewCustomerPage() {
  const session = await requireRole('admin');
  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/customers" className="text-sm text-purple-600 hover:underline">← Customers</Link>
          <h1 className="page-title mt-1">New Customer</h1>
        </div>
      </div>
      <div className="card">
        <CustomerForm
          action={createCustomerAction}
          isAdmin={session.role === 'admin'}
          cancelHref="/customers"
        />
      </div>
    </div>
  );
}
