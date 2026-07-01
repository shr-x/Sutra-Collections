import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import NewItemForm from './_form';

interface Category {
  id: string;
  name: string;
}

export default async function NewItemPage() {
  await requireSA();
  const { rows: categories } = await query<Category>(
    'SELECT id, name FROM item_categories ORDER BY name'
  );

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">New Item</h1>
        <Link href="/sa-console-x7k2/items" className="text-sm text-gray-500 hover:text-gray-300">
          ← Back
        </Link>
      </div>
      <NewItemForm categories={categories} />
    </div>
  );
}
