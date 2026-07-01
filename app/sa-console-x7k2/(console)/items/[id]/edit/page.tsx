import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import EditItemForm from './_form';

interface ItemRow {
  id: string;
  name: string;
  category_id: string | null;
  item_type: string;
  unit: string;
  hsn_code: string | null;
  gst_rate: string;
  is_active: boolean;
}

interface Category {
  id: string;
  name: string;
}

export default async function EditItemPage({ params }: { params: { id: string } }) {
  await requireSA();

  const [itemRes, categoriesRes] = await Promise.all([
    query<ItemRow>(
      `SELECT id, name, category_id, item_type, unit, hsn_code, gst_rate::text, is_active
       FROM items WHERE id=$1`,
      [params.id]
    ),
    query<Category>('SELECT id, name FROM item_categories ORDER BY name'),
  ]);

  const item = itemRes.rows[0];
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Edit Item</h1>
        <Link href="/sa-console-x7k2/items" className="text-sm text-gray-500 hover:text-gray-300">
          ← Back
        </Link>
      </div>
      <EditItemForm item={item} categories={categoriesRes.rows} />
    </div>
  );
}
