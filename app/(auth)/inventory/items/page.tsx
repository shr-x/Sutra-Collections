import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import SearchInput from '@/components/search-input';
import ConfirmForm from '@/components/confirm-form';
import { deleteItemAction } from './actions';
import ToggleItemActiveButton from './toggle-item-active-button';

export const metadata: Metadata = { title: 'Items' };

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string; active?: string };
}) {
  await requireRole('admin');
  const q = searchParams.q?.trim();
  const type = searchParams.type;
  const showInactive = searchParams.active === 'false';

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (showInactive) { conditions.push(`i.is_active = FALSE`); }
  else { conditions.push(`i.is_active = TRUE`); }
  if (q) { params.push(`%${q}%`); conditions.push(`i.name ILIKE $${params.length}`); }
  if (type) { params.push(type); conditions.push(`i.item_type = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: items } = await query(
    `SELECT i.id, i.name, i.hsn_code, i.item_type, i.gst_rate, i.unit, i.is_active,
            i.low_stock_threshold, i.sale_price, i.photo_url,
            cat.name AS category_name,
            COUNT(DISTINCT isz.id)::int AS size_count,
            COUNT(DISTINCT ic.id)::int AS color_count,
            COALESCE((SELECT SUM(s.quantity) FROM stock s WHERE s.item_id = i.id), 0) AS stock_qty
     FROM items i
     LEFT JOIN item_sizes isz ON isz.item_id = i.id
     LEFT JOIN item_colors ic ON ic.item_id = i.id
     LEFT JOIN item_categories cat ON cat.id = i.category_id
     ${where}
     GROUP BY i.id, cat.name ORDER BY i.name LIMIT 300`,
    params
  );

  const typeBaseHref = (v: string) =>
    `/inventory/items?${v ? `type=${v}` : ''}${q ? `&q=${q}` : ''}`;
  const inactiveHref = showInactive
    ? `/inventory/items?${type ? `type=${type}` : ''}${q ? `&q=${q}` : ''}`
    : `/inventory/items?active=false${type ? `&type=${type}` : ''}${q ? `&q=${q}` : ''}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Items</h1>
          <p className="text-sm text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/import" className="btn-secondary btn-sm">↑ Import</Link>
          <Link href="/inventory/items/new" className="btn-primary btn-sm">+ New Item</Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Search items…" />
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'All', value: '' },
            { label: 'Finished', value: 'finished' },
            { label: 'Raw Material', value: 'raw_material' },
          ].map((opt) => (
            <Link
              key={opt.value}
              href={typeBaseHref(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                (type ?? '') === opt.value
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </Link>
          ))}
          <Link
            href={inactiveHref}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              showInactive ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {showInactive ? 'Show Active' : 'Show Inactive'}
          </Link>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {items.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            {q || type ? 'No items match your filters.' : 'No items yet.'}
          </p>
        ) : (
          <>
            {/* ── Mobile: stacked cards (< sm) ───────────────────────────── */}
            <div className="sm:hidden space-y-3 p-3 bg-gray-50/60">
              {items.map((item) => {
                const qty = Number(item.stock_qty);
                const threshold = item.low_stock_threshold != null ? Number(item.low_stock_threshold) : null;
                const low = item.item_type === 'finished' && (threshold != null ? qty <= threshold : qty <= 0);
                const stockLabel = Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/\.?0+$/, '');
                return (
                  <div key={item.id} className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${!item.is_active ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      {/* Thumbnail */}
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center">
                        {item.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.photo_url} alt={item.name} className="h-12 w-12 object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-gray-300">
                            {item.name.split(/\s+/).slice(0,2).map((w: string) => w[0]?.toUpperCase() ?? '').join('')}
                          </span>
                        )}
                      </div>

                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/inventory/items/${item.id}`}
                          className="font-semibold text-gray-900 hover:text-purple-700 hover:underline block truncate"
                        >
                          {item.name}
                          {!item.is_active && <span className="ml-1 text-xs font-normal text-gray-400">(inactive)</span>}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          {item.category_name ? (
                            <span className="rounded-full bg-purple-50 px-2 py-0.5 font-medium text-purple-700">{item.category_name}</span>
                          ) : (
                            <span className={`rounded-full px-2 py-0.5 font-medium ${item.item_type === 'finished' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                              {item.item_type === 'finished' ? 'Finished' : 'Raw Mat.'}
                            </span>
                          )}
                          <span>{item.gst_rate}% GST</span>
                          {item.sale_price != null && (
                            <span className="font-medium text-gray-800">₹{Number(item.sale_price).toLocaleString('en-IN')}</span>
                          )}
                          {item.item_type === 'finished' && (
                            <span className={`font-medium ${low ? 'text-red-600' : 'text-gray-700'}`}>
                              Stock: {stockLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Action row — separated from item text for larger tap targets */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex gap-1.5">
                      <Link
                        href={`/inventory/items/${item.id}/edit`}
                        className="btn-ghost btn-sm flex-1 flex items-center justify-center gap-1 min-h-[36px]"
                      >
                        ✏️ Edit
                      </Link>
                      <div className="flex-1 flex">
                        <ToggleItemActiveButton id={item.id} isActive={!!item.is_active} />
                      </div>
                      {Number(item.stock_qty) === 0 && (
                        <ConfirmForm action={deleteItemAction} message={`Delete "${item.name}"? This cannot be undone.`} className="flex-1">
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit" className="btn-ghost btn-sm w-full min-h-[36px] flex items-center justify-center text-red-600 hover:bg-red-50">
                            🗑 Del
                          </button>
                        </ConfirmForm>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Desktop: table (≥ sm) ───────────────────────────────────── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-3 w-12 sticky left-0 z-10 bg-gray-50" />
                    <th className="px-4 py-3 text-left whitespace-nowrap">Name</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">HSN</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Category</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">GST</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Sale Price</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Stock</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Variants</th>
                    <th className="px-4 py-3 w-44 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id} className={`hover:bg-gray-50 ${!item.is_active ? 'bg-gray-50/70' : ''}`}>
                      <td className="px-3 py-2 sticky left-0 z-10 bg-white">
                        <div className="h-10 w-10 overflow-hidden rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center shrink-0">
                          {item.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.photo_url} alt={item.name} className="h-10 w-10 object-cover" />
                          ) : (
                            <span className="text-sm font-bold text-gray-300 select-none">
                              {item.name.split(/\s+/).slice(0,2).map((w: string) => w[0]?.toUpperCase() ?? '').join('')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link href={`/inventory/items/${item.id}`} className="hover:text-purple-700 hover:underline">
                          {item.name}
                        </Link>
                        {!item.is_active && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap">{item.hsn_code || '—'}</td>
                      <td className="px-4 py-3">
                        {item.category_name ? (
                          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                            {item.category_name}
                          </span>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.item_type === 'finished' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {item.item_type === 'finished' ? 'Finished' : 'Raw Mat.'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.gst_rate}%</td>
                      <td className="px-4 py-3 text-right text-gray-900 font-medium whitespace-nowrap">
                        {item.sale_price != null ? `₹${Number(item.sale_price).toLocaleString('en-IN')}` : <span className="text-gray-400 font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {item.item_type === 'finished' ? (() => {
                          const qty = Number(item.stock_qty);
                          const threshold = item.low_stock_threshold != null ? Number(item.low_stock_threshold) : null;
                          const low = threshold != null ? qty <= threshold : qty <= 0;
                          const label = Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/\.?0+$/, '');
                          return (
                            <span className={`font-medium tabular-nums ${low ? 'text-red-600' : 'text-gray-900'}`}>
                              {label}
                            </span>
                          );
                        })() : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {item.item_type === 'finished' ? (
                          <span>{item.size_count}S / {item.color_count}C</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/inventory/items/${item.id}/edit`} className="btn-ghost btn-sm">Edit</Link>
                          <ToggleItemActiveButton id={item.id} isActive={!!item.is_active} />
                          {Number(item.stock_qty) > 0 ? (
                            <button
                              type="button"
                              disabled
                              title="Cannot delete — item has stock"
                              className="cursor-not-allowed rounded-lg px-2 py-1 text-xs font-medium text-gray-300"
                            >
                              Delete
                            </button>
                          ) : (
                            <ConfirmForm
                              action={deleteItemAction}
                              message={`Delete "${item.name}"? This cannot be undone.`}
                              className="inline"
                            >
                              <input type="hidden" name="id" value={item.id} />
                              <button type="submit" className="btn-ghost btn-sm text-red-600 hover:bg-red-50">Delete</button>
                            </ConfirmForm>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
