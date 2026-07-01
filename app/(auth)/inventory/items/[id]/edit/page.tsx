import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { updateItemAction } from '../../actions';
import ItemForm from '../../item-form';
import type { Item, ItemCategory, ItemUnit } from '@/types';

export const metadata: Metadata = { title: 'Edit Item' };

export default async function EditItemPage({ params }: { params: { id: string } }) {
  await requireRole('admin');

  const [itemRes, categoriesRes, unitsRes] = await Promise.all([
    query<Item>('SELECT * FROM items WHERE id=$1', [params.id]),
    query<ItemCategory>('SELECT id, name, item_type FROM item_categories ORDER BY name'),
    query<ItemUnit>('SELECT id, name FROM item_units ORDER BY name'),
  ]);

  if (!itemRes.rows[0]) notFound();
  const item = itemRes.rows[0];
  const action = updateItemAction.bind(null, params.id);

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href={`/inventory/items/${params.id}`} className="text-sm text-purple-600 hover:underline">← {item.name}</Link>
          <h1 className="page-title mt-1">Edit Item</h1>
        </div>
      </div>
      <div className="card">
        <ItemForm
          action={action}
          defaultValues={item}
          cancelHref={`/inventory/items/${params.id}`}
          categories={categoriesRes.rows}
          units={unitsRes.rows}
        />
      </div>
    </div>
  );
}
