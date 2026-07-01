import { requireSA } from '@/lib/sa-auth';
import Link from 'next/link';
import NewSchemeForm from './_form';

export default async function NewSchemePage() {
  await requireSA();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">New Discount Scheme</h1>
        <Link href="/sa-console-x7k2/schemes" className="text-sm text-gray-500 hover:text-gray-300">
          ← Back
        </Link>
      </div>
      <NewSchemeForm />
    </div>
  );
}
