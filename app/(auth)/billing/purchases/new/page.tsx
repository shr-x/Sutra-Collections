import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import PurchaseForm from './purchase-form';
import { createPurchaseInvoiceAction } from '../actions';

export const metadata: Metadata = { title: 'New Purchase Invoice' };

export default async function NewPurchasePage() {
  const session = await requireRole('admin');

  const [itemsRes, suppliersRes, warehousesRes] = await Promise.all([
    query(
      `SELECT i.id, i.name, i.unit, i.gst_rate, i.hsn_code, i.sale_price,
         COALESCE(json_agg(DISTINCT jsonb_build_object('id', s.id, 'size_name', s.size_name, 'is_default', s.is_default))
           FILTER (WHERE s.id IS NOT NULL), '[]') AS sizes,
         COALESCE(json_agg(DISTINCT jsonb_build_object('id', c.id, 'color_name', c.color_name, 'is_default', c.is_default))
           FILTER (WHERE c.id IS NOT NULL), '[]') AS colors
       FROM items i
       LEFT JOIN item_sizes s ON s.item_id = i.id
       LEFT JOIN item_colors c ON c.item_id = i.id
       WHERE i.is_active = TRUE
       GROUP BY i.id ORDER BY i.name`
    ),
    query('SELECT id, name FROM suppliers ORDER BY name'),
    query('SELECT id, name FROM warehouses WHERE is_active=TRUE ORDER BY name'),
  ]);

  const defaultWarehouseId = session.role === 'staff' ? (session.warehouseId ?? '') : '';

  return (
    <div>
      <div className="page-header"><h1 className="page-title">New Purchase Invoice</h1></div>
      <PurchaseForm
        action={createPurchaseInvoiceAction}
        items={itemsRes.rows as never}
        suppliers={suppliersRes.rows as never}
        warehouses={warehousesRes.rows as never}
        defaultWarehouseId={defaultWarehouseId || null}
      />
    </div>
  );
}
