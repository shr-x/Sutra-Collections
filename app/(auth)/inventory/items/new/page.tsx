import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { createItemAction } from '../actions';
import ItemForm from '../item-form';
import type { ItemCategory, ItemUnit } from '@/types';

export const metadata: Metadata = { title: 'New Item' };

export default async function NewItemPage() {
  await requireRole('admin');

  const [categoriesRes, unitsRes] = await Promise.all([
    query<ItemCategory>('SELECT id, name, item_type FROM item_categories ORDER BY name'),
    query<ItemUnit>('SELECT id, name FROM item_units ORDER BY name'),
  ]);

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/inventory/items" className="text-sm text-purple-600 hover:underline">← Items</Link>
          <h1 className="page-title mt-1">New Item</h1>
        </div>
      </div>
      <div className="card">
        <ItemForm
          action={createItemAction}
          cancelHref="/inventory/items"
          categories={categoriesRes.rows}
          units={unitsRes.rows}
        />
      </div>
    </div>
  );
}
