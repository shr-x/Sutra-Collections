import { requireSA } from '@/lib/sa-auth';
import { NewCustomerForm } from './_form';

export default async function NewCustomerPage() {
  await requireSA();

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-xl font-semibold text-white">New Customer</h1>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <NewCustomerForm />
      </div>
    </div>
  );
}
