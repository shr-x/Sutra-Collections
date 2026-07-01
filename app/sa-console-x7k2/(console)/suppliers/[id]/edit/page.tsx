import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { notFound } from 'next/navigation';
import { EditSupplierForm } from './_form';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
}

export default async function EditSupplierPage({
  params,
}: {
  params: { id: string };
}) {
  await requireSA();

  const res = await query<Supplier>(
    `SELECT id, name, phone, email, address, gstin FROM suppliers WHERE id=$1`,
    [params.id]
  );
  const supplier = res.rows[0];
  if (!supplier) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-xl font-semibold text-white">Edit Supplier</h1>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <EditSupplierForm id={supplier.id} defaultValues={supplier} />
      </div>
    </div>
  );
}
