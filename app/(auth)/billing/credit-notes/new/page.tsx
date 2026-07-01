import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import RefundForm from './credit-note-form';
import { createCreditNoteAction } from '../actions';

export const metadata: Metadata = { title: 'New Refund' };

export default async function NewRefundPage({ searchParams }: { searchParams: { invoice_id?: string } }) {
  const session = await requireRole('admin', 'staff');

  const [customersRes, warehousesRes, invRes] = await Promise.all([
    query('SELECT id, name FROM customers WHERE is_active=TRUE AND deleted_at IS NULL ORDER BY name'),
    query('SELECT id, name FROM warehouses WHERE is_active=TRUE ORDER BY name'),
    searchParams.invoice_id
      ? query(
          `SELECT ii.id, ii.item_id, it.name AS item_name, iv.size, iv.color,
                  ii.quantity, ii.rate, ii.gst_rate, ii.hsn_code, ii.variant_id
           FROM invoice_items ii
           JOIN items it ON it.id=ii.item_id
           LEFT JOIN item_variants iv ON iv.id=ii.variant_id
           WHERE ii.invoice_id=$1`,
          [searchParams.invoice_id]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const defaultWarehouseId = session.role === 'staff' ? (session.warehouseId ?? '') : '';

  return (
    <div>
      <div className="page-header"><h1 className="page-title">New Refund</h1></div>
      <RefundForm
        action={createCreditNoteAction}
        customers={customersRes.rows as never}
        warehouses={warehousesRes.rows as never}
        defaultWarehouseId={defaultWarehouseId || null}
        invoiceId={searchParams.invoice_id}
        invoiceLines={invRes.rows as never}
      />
    </div>
  );
}
