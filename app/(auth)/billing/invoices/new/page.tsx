import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import InvoiceBuilder from '../invoice-builder';
import { createInvoiceAction } from '../actions';

export const metadata: Metadata = { title: 'New Invoice' };

export default async function NewInvoicePage() {
  const session = await requireRole('admin', 'staff');

  const [itemsRes, customersRes, warehousesRes, settingsRes, schemesRes] = await Promise.all([
    query(
      `SELECT i.id, i.name, i.unit, i.gst_rate, i.hsn_code, i.item_type, i.sale_price,
         COALESCE(json_agg(json_build_object('id',iv.id,'size',iv.size,'color',iv.color,'sku',iv.sku))
           FILTER (WHERE iv.id IS NOT NULL), '[]') AS variants
       FROM items i LEFT JOIN item_variants iv ON iv.item_id = i.id
       WHERE i.is_active = TRUE GROUP BY i.id ORDER BY i.name`
    ),
    query('SELECT id, name, phone, credit_limit, loyalty_points_balance FROM customers WHERE is_active=TRUE AND deleted_at IS NULL ORDER BY name'),
    query('SELECT id, name FROM warehouses WHERE is_active=TRUE ORDER BY name'),
    query(`SELECT key, value FROM settings WHERE key IN ('loyalty_redemption_rate','loyalty_earn_rate')`),
    query(
      `SELECT id, name, scheme_type, buy_item_id, buy_quantity, get_item_id, get_quantity, discount_value, min_order_value
       FROM discount_schemes
       WHERE is_active=TRUE
         AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
         AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)`
    ),
  ]);

  const settingsMap = Object.fromEntries(settingsRes.rows.map((r) => [r.key as string, r.value as string]));
  const loyaltyRedemptionRate = parseFloat(settingsMap.loyalty_redemption_rate ?? '1') || 1;

  const defaultWarehouseId =
    session.role === 'staff' ? (session.warehouseId ?? '') : '';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">New Invoice</h1>
      </div>
      <InvoiceBuilder
        action={createInvoiceAction}
        showSendDialog
        items={itemsRes.rows as Parameters<typeof InvoiceBuilder>[0]['items']}
        customers={customersRes.rows as Parameters<typeof InvoiceBuilder>[0]['customers']}
        warehouses={warehousesRes.rows as Parameters<typeof InvoiceBuilder>[0]['warehouses']}
        defaultWarehouseId={defaultWarehouseId || null}
        loyaltyRedemptionRate={loyaltyRedemptionRate}
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
        }))}
      />
    </div>
  );
}
