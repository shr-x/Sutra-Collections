import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import DesignForm from './design-form';

export const metadata: Metadata = { title: 'New Design' };

export default async function NewDesignPage() {
  await requireRole('admin');

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/designs" className="text-sm text-purple-600 hover:underline">← Design Catalog</Link>
          <h1 className="page-title mt-1">New Design</h1>
        </div>
      </div>
      <div className="max-w-xl">
        <DesignForm />
      </div>
    </div>
  );
}
