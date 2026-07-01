import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import UserForm from '../user-form';
import { createUserAction } from '../actions';

export const metadata: Metadata = { title: 'Add User' };

export default async function NewUserPage() {
  await requireRole('admin');

  const { rows: warehouses } = await pool.query<{ id: string; name: string }>(
    'SELECT id, name FROM warehouses WHERE is_active = TRUE ORDER BY name'
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Add User</h1>
          <p className="text-sm text-gray-500">Create a new login account</p>
        </div>
        <Link href="/settings/users" className="btn-secondary">← Back</Link>
      </div>

      <UserForm action={createUserAction} warehouses={warehouses} />
    </div>
  );
}
