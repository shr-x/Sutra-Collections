import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole, getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import SearchInput from '@/components/search-input';
import MovementForm from './movement-form';
import { createStockMovementAction } from './actions';
import type { Warehouse } from '@/types';

export const metadata: Metadata = { title: 'Stock' };

export default async function StockPage({
  searchParams,
}: {
  searchParams: { q?: string; warehouse?: string };
}) {
  const session = await requireRole('admin');
  const isAdmin = session.role === 'admin';

  // Staff only see their assigned warehouse
  const staffWarehouseId = session.role === 'staff' ? session.warehouseId : null;
  const warehouseFilter = staffWarehouseId ?? searchParams.warehouse;

  const conditions: string[] = ['i.is_active = TRUE'];
  const params: unknown[] = [];

  if (warehouseFilter) {
    params.push(warehouseFilter);
    conditions.push(`s.warehouse_id = $${params.length}`);
  }
  if (searchParams.q) {
    params.push(`%${searchParams.q.trim()}%`);
    conditions.push(`i.name ILIKE $${params.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [stockRes, warehousesRes, itemsRes] = await Promise.all([
    query(
      `SELECT
         s.id, s.quantity, s.item_id, s.variant_id, s.size_id, s.color_id,
         i.name AS item_name, i.unit, i.low_stock_threshold, i.item_type,
         iv.size, iv.color, iv.sku,
         isz.size_name, ic.color_name,
         w.id AS warehouse_id, w.name AS warehouse_name
       FROM stock s
       JOIN items i ON i.id = s.item_id
       LEFT JOIN item_variants iv ON iv.id = s.variant_id
       LEFT JOIN item_sizes isz ON isz.id = s.size_id
       LEFT JOIN item_colors ic ON ic.id = s.color_id
       JOIN warehouses w ON w.id = s.warehouse_id
       ${where}
       ORDER BY i.name, isz.sort_order, ic.sort_order, iv.color, iv.size, w.name`,
      params
    ),
    query<Warehouse>('SELECT id, name FROM warehouses WHERE is_active=TRUE ORDER BY name'),
    // For movement form (admin only)
    isAdmin ? query(`
      SELECT i.id, i.name, i.unit, i.item_type,
        COALESCE(
          json_agg(json_build_object('id',iv.id,'size',iv.size,'color',iv.color,'sku',iv.sku))
          FILTER (WHERE iv.id IS NOT NULL), '[]'
        ) AS variants
      FROM items i LEFT JOIN item_variants iv ON iv.item_id = i.id
      WHERE i.is_active = TRUE
      GROUP BY i.id ORDER BY i.name
    `) : Promise.resolve({ rows: [] }),
  ]);

  const stockRows = stockRes.rows;
  const warehouses = warehousesRes.rows;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = itemsRes.rows as any[];

  const lowStockCount = stockRows.filter(
    (r) => r.low_stock_threshold && Number(r.quantity) < Number(r.low_stock_threshold)
  ).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock</h1>
          {lowStockCount > 0 && (
            <p className="mt-0.5 text-sm text-red-600 font-medium">
              ⚠ {lowStockCount} item{lowStockCount !== 1 ? 's' : ''} below low-stock threshold
            </p>
          )}
        </div>
        <Link href="/inventory/items" className="btn-secondary">Manage Items →</Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Stock table */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SearchInput placeholder="Filter by item name…" />
            {!staffWarehouseId && (
              <div className="flex gap-1.5 text-sm">
                <Link
                  href="/inventory/stock"
                  className={`rounded-full px-3 py-1 text-xs font-medium ${!searchParams.warehouse ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
                >
                  All Warehouses
                </Link>
                {warehouses.map((w) => (
                  <Link
                    key={w.id}
                    href={`/inventory/stock?warehouse=${w.id}`}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      searchParams.warehouse === w.id ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {w.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            {stockRows.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-gray-500">
                No stock recorded yet. Stock updates automatically when Purchase Invoices are saved.
              </p>
            ) : (
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left whitespace-nowrap sticky left-0 z-10 bg-gray-50">Item</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Size / Colour</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Warehouse</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stockRows.map((row) => {
                    const isLow = row.low_stock_threshold && Number(row.quantity) < Number(row.low_stock_threshold);

                    // Determine variant label
                    let variantLabel = '—';
                    if (row.size_id || row.color_id) {
                      const parts = [row.color_name, row.size_name].filter(
                        (v: string | null) => v && v !== 'None' && v !== 'Regular'
                      );
                      variantLabel = parts.join(' / ') || 'Standard';
                    } else if (row.sku) {
                      variantLabel = row.sku;
                    } else if (row.color || row.size) {
                      variantLabel = [row.color, row.size].filter(Boolean).join(' / ');
                    }

                    return (
                      <tr key={row.id} className={`hover:bg-gray-50 ${isLow ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3 sticky left-0 z-10 bg-white">
                          <Link
                            href={`/inventory/items/${row.item_id}`}
                            className="font-medium text-gray-900 hover:text-purple-700"
                          >
                            {row.item_name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{variantLabel}</td>
                        <td className="px-4 py-3 text-gray-600">{row.warehouse_name}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className={`font-semibold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                            {Number(row.quantity).toLocaleString('en-IN')}
                          </span>
                          <span className="ml-1 text-xs text-gray-400">{row.unit}</span>
                          {isLow && <span className="ml-1.5 text-xs text-red-500">⚠ Low</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>

        {/* Movement form — Admin only */}
        <div className="card">
          {isAdmin ? (
            <>
              <h2 className="mb-4 font-semibold text-gray-900">Record Movement</h2>
              <MovementForm
                action={createStockMovementAction}
                items={items}
                warehouses={warehouses}
                defaultWarehouseId={staffWarehouseId}
                staffLocked={false}
              />
            </>
          ) : (
            <>
              <h2 className="mb-3 font-semibold text-gray-900">Stock Adjustments</h2>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                <p className="font-medium mb-1">Read-only for Staff</p>
                <p className="text-xs leading-relaxed">
                  Stock updates automatically when Purchase Invoices are saved.
                  For manual corrections, contact an Admin.
                </p>
              </div>
              <p className="mt-4 text-xs text-gray-400">
                To adjust stock for a specific item, open the item and use the Sizes &amp; Colours stock grid.
              </p>
              <Link href="/inventory/items" className="mt-3 block text-xs text-purple-600 hover:underline">
                → Go to Items
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
