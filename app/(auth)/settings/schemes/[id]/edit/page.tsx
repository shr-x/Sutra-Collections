import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import SchemeForm from '../../scheme-form';
import { updateSchemeAction } from '../../actions';

export const metadata: Metadata = { title: 'Edit Scheme' };

export default async function EditSchemePage({ params }: { params: { id: string } }) {
  await requireRole('admin');
  const [schemeRes, itemsRes, categoriesRes, scopedItemsRes, scopedCategoriesRes] = await Promise.all([
    query('SELECT * FROM discount_schemes WHERE id=$1', [params.id]),
    query('SELECT id, name FROM items WHERE is_active=TRUE ORDER BY name'),
    query('SELECT id, name FROM item_categories ORDER BY name'),
    query('SELECT item_id FROM discount_scheme_items WHERE scheme_id=$1', [params.id]),
    query('SELECT category_id FROM discount_scheme_categories WHERE scheme_id=$1', [params.id]),
  ]);
  if (!schemeRes.rows[0]) notFound();
  const s = schemeRes.rows[0];
  const action = updateSchemeAction.bind(null, params.id);

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Edit Scheme</h1></div>
      <SchemeForm
        action={action}
        items={itemsRes.rows as { id: string; name: string }[]}
        categories={categoriesRes.rows as { id: string; name: string }[]}
        initialData={{
          name: s.name, scheme_type: s.scheme_type,
          buy_item_id: s.buy_item_id, buy_quantity: s.buy_quantity ? Number(s.buy_quantity) : undefined,
          get_item_id: s.get_item_id, get_quantity: s.get_quantity ? Number(s.get_quantity) : undefined,
          discount_value: s.discount_value ? Number(s.discount_value) : undefined,
          min_order_value: s.min_order_value ? Number(s.min_order_value) : undefined,
          valid_from: s.valid_from?.toISOString?.()?.slice(0, 10),
          valid_until: s.valid_until?.toISOString?.()?.slice(0, 10),
          item_ids: scopedItemsRes.rows.map((r) => r.item_id as string),
          category_ids: scopedCategoriesRes.rows.map((r) => r.category_id as string),
        }}
      />
    </div>
  );
}
