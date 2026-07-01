import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { pool } from '@/lib/db';
import UserForm from '../../user-form';
import { updateUserAction } from '../../actions';

export const metadata: Metadata = { title: 'Edit User' };

export default async function EditUserPage({ params }: { params: { id: string } }) {
  await requireRole('admin');

  const [userRes, whRes] = await Promise.all([
    pool.query<{
      id: string; name: string; email: string; role: string;
      warehouse_id: string | null; access_expires_at: Date | null; base_salary: number;
    }>(
      `SELECT id, name, email, role, warehouse_id, access_expires_at,
              COALESCE(base_salary, 0)::numeric AS base_salary
       FROM users WHERE id=$1`,
      [params.id]
    ),
    pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM warehouses WHERE is_active = TRUE ORDER BY name'
    ),
  ]);

  const user = userRes.rows[0];
  if (!user) notFound();

  const boundAction = updateUserAction.bind(null, params.id);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Edit User — {user.name}</h1>
        </div>
        <Link href="/settings/users" className="btn-secondary">← Back</Link>
      </div>

      <UserForm
        action={boundAction}
        warehouses={whRes.rows}
        isEdit
        defaultValues={{
          name:              user.name,
          email:             user.email,
          role:              user.role,
          warehouse_id:      user.warehouse_id,
          access_expires_at: user.access_expires_at
            ? new Date(user.access_expires_at).toISOString()
            : null,
          base_salary: Number(user.base_salary),
        }}
      />
    </div>
  );
}
