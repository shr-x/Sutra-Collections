import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { notFound } from 'next/navigation';
import EditUserForm from './_edit-form';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  base_salary: string;
  warehouse_id: string | null;
  access_expires_at: string | null;
}

interface Warehouse {
  id: string;
  name: string;
}

interface Props {
  params: { id: string };
}

export default async function EditUserPage({ params }: Props) {
  await requireSA();

  const [userRes, warehouseRes] = await Promise.all([
    query<UserRow>(
      `SELECT id, name, email, role, is_active, base_salary::text, warehouse_id, access_expires_at
       FROM users WHERE id = $1`,
      [params.id]
    ),
    query<Warehouse>('SELECT id, name FROM warehouses WHERE is_active = TRUE ORDER BY name'),
  ]);

  const user = userRes.rows[0];
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-white">Edit User</h1>
      <EditUserForm user={user} warehouses={warehouseRes.rows} />
    </div>
  );
}
