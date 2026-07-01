import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import type { Item } from '@/types';
import ItemPhotoUploader from '@/components/item-photo-uploader';
import SizeColorManager from '@/components/size-color-manager';

export const metadata: Metadata = { title: 'Item Detail' };

export default async function ItemDetailPage({ params }: { params: { id: string } }) {
  await requireRole('admin');

  const [itemRes, sizesRes, colorsRes, warehousesRes, stockRes] = await Promise.all([
    query<Item>('SELECT * FROM items WHERE id=$1', [params.id]),
    query('SELECT id, size_name, is_default, sort_order FROM item_sizes WHERE item_id=$1 ORDER BY sort_order, size_name', [params.id]),
    query('SELECT id, color_name, is_default, sort_order FROM item_colors WHERE item_id=$1 ORDER BY sort_order, color_name', [params.id]),
    query('SELECT id, name FROM warehouses WHERE is_active=TRUE ORDER BY name'),
    query(
      `SELECT size_id, color_id, warehouse_id, quantity FROM stock
       WHERE item_id=$1 AND size_id IS NOT NULL AND color_id IS NOT NULL`,
      [params.id]
    ),
  ]);

  if (!itemRes.rows[0]) notFound();
  const item = itemRes.rows[0];
  const isFinished = item.item_type === 'finished';

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/inventory/items" className="text-sm text-purple-600 hover:underline">← Items</Link>
          <h1 className="page-title mt-1">{item.name}</h1>
          {!item.is_active && (
            <span className="ml-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inactive</span>
          )}
        </div>
        <Link href={`/inventory/items/${item.id}/edit`} className="btn-secondary">Edit Item</Link>
      </div>

      <ItemPhotoUploader itemId={item.id} currentPhotoUrl={item.photo_url} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Details */}
        <div className="card">
          <h2 className="mb-4 font-semibold text-gray-900">Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-gray-500">HSN Code</dt>
              <dd className="mt-0.5 font-mono font-bold text-gray-900">{item.hsn_code || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Type</dt>
              <dd className="mt-0.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isFinished ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {isFinished ? 'Finished Good' : 'Raw Material'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">GST Rate</dt>
              <dd className="mt-0.5 font-bold text-gray-900">{item.gst_rate}%</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Unit</dt>
              <dd className="mt-0.5 font-bold text-gray-900">{item.unit}</dd>
            </div>
            {item.sale_price != null && (
              <div>
                <dt className="text-xs font-medium text-gray-500">Sale Price</dt>
                <dd className="mt-0.5 font-bold text-purple-700">₹{Number(item.sale_price).toLocaleString('en-IN')}</dd>
              </div>
            )}
            {item.low_stock_threshold && (
              <div>
                <dt className="text-xs font-medium text-gray-500">Low Stock Alert</dt>
                <dd className="mt-0.5 font-bold text-amber-700">Below {item.low_stock_threshold} {item.unit}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Sizes, Colors & Stock */}
        <div className="card col-span-1 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-gray-900">Sizes, Colours &amp; Stock</h2>
          <SizeColorManager
            itemId={item.id}
            initialSizes={sizesRes.rows as never}
            initialColors={colorsRes.rows as never}
            warehouses={warehousesRes.rows as never}
            initialStock={stockRes.rows as never}
          />
        </div>
      </div>
    </div>
  );
}
