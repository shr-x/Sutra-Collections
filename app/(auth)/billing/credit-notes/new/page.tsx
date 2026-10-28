import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import RefundForm from './credit-note-form';
import { createCreditNoteAction } from '../actions';

export const metadata: Metadata = { title: 'New Refund' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewRefundPage({
  searchParams,
}: {
  searchParams: { invoice_id?: string; return_to?: string };
}) {
  const session = await requireRole('admin', 'staff');

  // Only accept a real invoice id; anything else falls back to the search step.
  const invoiceId = searchParams.invoice_id && UUID_RE.test(searchParams.invoice_id)
    ? searchParams.invoice_id
    : undefined;

  const [customersRes, warehousesRes, invRes, headerRes] = await Promise.all([
    query('SELECT id, name FROM customers WHERE is_active=TRUE AND deleted_at IS NULL ORDER BY name'),
    query('SELECT id, name FROM warehouses WHERE is_active=TRUE ORDER BY name'),
    invoiceId
      ? query(
          `SELECT ii.id, ii.item_id, it.name AS item_name, ii.variant_id,
                  COALESCE(iv.size, s.size_name) AS size,
                  COALESCE(iv.color, c.color_name) AS color,
                  ii.quantity, ii.rate, ii.gst_rate, ii.hsn_code
           FROM invoice_items ii
           JOIN items it ON it.id=ii.item_id
           LEFT JOIN item_variants iv ON iv.id=ii.variant_id
           LEFT JOIN item_sizes s ON s.id = ii.size_id
           LEFT JOIN item_colors c ON c.id = ii.color_id
           WHERE ii.invoice_id=$1
           ORDER BY ii.sort_order`,
          [invoiceId]
        )
      : Promise.resolve({ rows: [] }),
    invoiceId
      ? query(
          `SELECT i.id, i.invoice_number, i.invoice_date, i.grand_total, i.amount_paid, i.status,
                  i.customer_id, i.warehouse_id, c.name AS customer_name, c.phone AS customer_phone
           FROM invoices i
           LEFT JOIN customers c ON c.id = i.customer_id
           WHERE i.id=$1 AND i.status NOT IN ('cancelled','draft')`,
          [invoiceId]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const invoice = headerRes.rows[0] as
    | { id: string; invoice_number: string; invoice_date: string; grand_total: string; amount_paid: string;
        status: string; customer_id: string | null; warehouse_id: string; customer_name: string | null;
        customer_phone: string | null }
    | undefined;

  // Staff are tied to one warehouse; otherwise default to the invoice's warehouse.
  const defaultWarehouseId =
    session.role === 'staff' ? (session.warehouseId ?? '') : (invoice?.warehouse_id ?? '');

  // "Return" from the invoice page comes back to that invoice when done.
  const returnTo = invoice && searchParams.return_to === 'invoice'
    ? `/billing/invoices/${invoice.id}`
    : undefined;

  return (
    <div>
      <div className="page-header"><h1 className="page-title">New Refund</h1></div>
      <RefundForm
        action={createCreditNoteAction}
        customers={customersRes.rows as never}
        warehouses={warehousesRes.rows as never}
        defaultWarehouseId={defaultWarehouseId || null}
        invoiceId={invoice?.id}
        initialInvoice={invoice ?? null}
        invoiceLines={invoice ? (invRes.rows as never) : []}
        preselectedCustomerId={invoice?.customer_id ?? undefined}
        returnTo={returnTo}
      />
    </div>
  );
}
