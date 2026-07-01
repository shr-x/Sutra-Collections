import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { notFound } from 'next/navigation';
import { EditCustomerForm } from './_form';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  credit_limit: string;
}

export default async function EditCustomerPage({
  params,
}: {
  params: { id: string };
}) {
  await requireSA();

  const res = await query<Customer>(
    `SELECT id, name, phone, address, gstin, credit_limit FROM customers WHERE id=$1`,
    [params.id]
  );
  const customer = res.rows[0];
  if (!customer) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-xl font-semibold text-white">Edit Customer</h1>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <EditCustomerForm id={customer.id} defaultValues={customer} />
      </div>
    </div>
  );
}
