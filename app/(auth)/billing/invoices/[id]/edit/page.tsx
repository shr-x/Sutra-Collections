import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import InvoiceBuilder from '../../invoice-builder';
import { updateInvoiceAction } from '../../actions';

export const metadata: Metadata = { title: 'Edit Invoice' };

export default async function EditInvoicePage({ params }: { params: { id: string } }) {
  const session = await requireRole('admin', 'staff');

  const [invRes, lineRes, itemsRes, customersRes, warehousesRes, schemesRes] = await Promise.all([
    query('SELECT * FROM invoices WHERE id=$1', [params.id]),
    query(
      `SELECT ii.*, it.name AS item_name, it.item_type,
              iv.size, iv.color, iv.sku,
              isz.size_name, ic.color_name
       FROM invoice_items ii
       JOIN items it ON it.id=ii.item_id
       LEFT JOIN item_variants iv ON iv.id=ii.variant_id
       LEFT JOIN item_sizes isz ON isz.id=ii.size_id
       LEFT JOIN item_colors ic ON ic.id=ii.color_id
       WHERE ii.invoice_id=$1 ORDER BY ii.sort_order`,
      [params.id]
    ),
    query(
      `SELECT i.id, i.name, i.unit, i.gst_rate, i.hsn_code, i.item_type, i.sale_price, i.category_id,
         COALESCE(json_agg(json_build_object('id',iv.id,'size',iv.size,'color',iv.color,'sku',iv.sku))
           FILTER (WHERE iv.id IS NOT NULL), '[]') AS variants
       FROM items i LEFT JOIN item_variants iv ON iv.item_id = i.id
       WHERE i.is_active = TRUE GROUP BY i.id ORDER BY i.name`
    ),
    query('SELECT id, name, phone, credit_limit, loyalty_points_balance FROM customers WHERE is_active=TRUE AND deleted_at IS NULL ORDER BY name'),
    query('SELECT id, name FROM warehouses WHERE is_active=TRUE ORDER BY name'),
    query(
      `SELECT ds.id, ds.name, ds.scheme_type, ds.buy_item_id, ds.buy_quantity, ds.get_item_id, ds.get_quantity,
              ds.discount_value, ds.min_order_value,
              COALESCE((SELECT json_agg(item_id) FROM discount_scheme_items WHERE scheme_id = ds.id), '[]') AS item_ids,
              COALESCE((SELECT json_agg(category_id) FROM discount_scheme_categories WHERE scheme_id = ds.id), '[]') AS category_ids
       FROM discount_schemes ds
       WHERE ds.is_active=TRUE
         AND (ds.valid_from IS NULL OR ds.valid_from <= CURRENT_DATE)
         AND (ds.valid_until IS NULL OR ds.valid_until >= CURRENT_DATE)`
    ),
  ]);

  if (!invRes.rows[0]) notFound();

  const inv = invRes.rows[0];

  // Check grace window server-side
  const ageMs = Date.now() - new Date(inv.created_at).getTime();
  if (inv.status === 'cancelled' || (inv.status !== 'draft' && ageMs > 60 * 60 * 1000)) {
    redirect(`/billing/invoices/${params.id}`);
  }

  const action = updateInvoiceAction.bind(null, params.id);

  const lines = lineRes.rows.map((row) => ({
    key: `line-${row.id}`,
    item_id: row.item_id,
    item_name: row.item_name,
    variant_id: row.variant_id ?? null,
    variant_label: [row.color, row.size].filter(Boolean).join(' / ') || row.sku || null,
    size_id: row.size_id ?? null,
    color_id: row.color_id ?? null,
    size_label: row.size_name ?? '',
    color_label: row.color_name ?? '',
    quantity: Number(row.quantity),
    rate: Number(row.rate),
    discount_type: row.discount_type ?? null,
    discount_value: row.discount_value ? Number(row.discount_value) : null,
    hsn_code: row.hsn_code ?? null,
    gst_rate: Number(row.gst_rate),
  }));

  const defaultWarehouseId = session.role === 'staff' ? (session.warehouseId ?? '') : '';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Edit Invoice — <span className="font-mono">{inv.invoice_number}</span></h1>
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
          Editable within 1 hour of issue
        </span>
      </div>
      <InvoiceBuilder
        action={action}
        items={itemsRes.rows as Parameters<typeof InvoiceBuilder>[0]['items']}
        customers={customersRes.rows as Parameters<typeof InvoiceBuilder>[0]['customers']}
        warehouses={warehousesRes.rows as Parameters<typeof InvoiceBuilder>[0]['warehouses']}
        defaultWarehouseId={defaultWarehouseId || null}
        isScheme={inv.is_scheme_invoice}
        discountSchemes={schemesRes.rows.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          name: s.name as string,
          scheme_type: s.scheme_type as string,
          buy_item_id: (s.buy_item_id as string | null) ?? null,
          buy_quantity: Number(s.buy_quantity),
          get_item_id: (s.get_item_id as string | null) ?? null,
          get_quantity: Number(s.get_quantity),
          discount_value: s.discount_value == null ? null : Number(s.discount_value),
          min_order_value: s.min_order_value == null ? 0 : Number(s.min_order_value),
          item_ids: (s.item_ids as string[]) ?? [],
          category_ids: (s.category_ids as string[]) ?? [],
        }))}
        initialData={{
          customer_id: inv.customer_id,
          warehouse_id: inv.warehouse_id,
          invoice_date: inv.invoice_date?.toISOString?.()?.slice(0, 10) ?? inv.invoice_date,
          due_date: inv.due_date?.toISOString?.()?.slice(0, 10) ?? inv.due_date,
          invoice_type: inv.invoice_type,
          is_scheme_invoice: inv.is_scheme_invoice,
          payment_mode: inv.payment_mode,
          amount_paid: Number(inv.amount_paid),
          invoice_discount_type: inv.invoice_discount_type,
          invoice_discount_value: inv.invoice_discount_value ? Number(inv.invoice_discount_value) : undefined,
          is_recurring: inv.is_recurring,
          recurring_frequency: inv.recurring_frequency,
          notes: inv.notes,
          loyalty_points_redeemed: Number(inv.loyalty_points_redeemed ?? 0),
          scheme_discount_amount: Number(inv.scheme_discount_amount ?? 0),
          loyalty_discount_amount: Number(inv.loyalty_discount_amount ?? 0),
          lines,
        }}
      />
    </div>
  );
}
