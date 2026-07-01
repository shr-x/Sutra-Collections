import { requireSA } from '@/lib/sa-auth';
import { NewSupplierForm } from './_form';

export default async function NewSupplierPage() {
  await requireSA();

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-xl font-semibold text-white">New Supplier</h1>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <NewSupplierForm />
      </div>
    </div>
  );
}
