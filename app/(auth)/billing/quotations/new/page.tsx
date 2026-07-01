import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import InvoiceBuilder from '../../invoices/invoice-builder';
import { createQuotationAction } from '../actions';

export const metadata: Metadata = { title: 'New Quotation' };

export default async function NewQuotationPage() {
  const session = await requireRole('admin');

  const [itemsRes, customersRes, warehousesRes] = await Promise.all([
    query(
      `SELECT i.id, i.name, i.unit, i.gst_rate, i.hsn_code, i.item_type,
         COALESCE(json_agg(json_build_object('id',iv.id,'size',iv.size,'color',iv.color,'sku',iv.sku))
           FILTER (WHERE iv.id IS NOT NULL), '[]') AS variants
       FROM items i LEFT JOIN item_variants iv ON iv.item_id = i.id
       WHERE i.is_active = TRUE GROUP BY i.id ORDER BY i.name`
    ),
    query('SELECT id, name, phone, credit_limit FROM customers WHERE is_active=TRUE AND deleted_at IS NULL ORDER BY name'),
    query('SELECT id, name FROM warehouses WHERE is_active=TRUE ORDER BY name'),
  ]);

  const defaultWarehouseId = session.role === 'staff' ? (session.warehouseId ?? '') : '';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">New Quotation</h1>
      </div>
      <InvoiceBuilder
        action={createQuotationAction}
        items={itemsRes.rows as Parameters<typeof InvoiceBuilder>[0]['items']}
        customers={customersRes.rows as Parameters<typeof InvoiceBuilder>[0]['customers']}
        warehouses={warehousesRes.rows as Parameters<typeof InvoiceBuilder>[0]['warehouses']}
        defaultWarehouseId={defaultWarehouseId || null}
      />
    </div>
  );
}
