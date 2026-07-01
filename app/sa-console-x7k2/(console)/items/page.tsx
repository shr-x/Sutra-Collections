import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import { toggleSAItemActiveAction } from './actions';

interface ItemRow {
  id: string;
  name: string;
  category: string | null;
  item_type: string;
  unit: string;
  hsn_code: string | null;
  gst_rate: string;
  is_active: boolean;
  variant_count: string;
}

export default async function ItemsPage() {
  await requireSA();

  const { rows } = await query<ItemRow>(`
    SELECT i.id, i.name, ic.name AS category, i.item_type, i.unit,
           i.hsn_code, i.gst_rate::text, i.is_active,
           COUNT(v.id)::text AS variant_count
    FROM items i
    LEFT JOIN item_categories ic ON ic.id = i.category_id
    LEFT JOIN item_variants v ON v.item_id = i.id
    GROUP BY i.id, ic.name
    ORDER BY i.name
  `);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Items / Products</h1>
        <Link
          href="/sa-console-x7k2/items/new"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Item
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-700/50">
            <tr>
              {['Name', 'Category', 'Type', 'Unit', 'HSN', 'GST%', 'Variants', 'Active', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                <td className="px-4 py-3 text-sm font-medium text-white">{item.name}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.category ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  <span className="rounded bg-gray-700 px-2 py-0.5 text-xs capitalize text-gray-300">
                    {item.item_type === 'raw_material' ? 'Raw Material' : 'Finished'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.unit}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.hsn_code ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.gst_rate}%</td>
                <td className="px-4 py-3 text-sm text-gray-300">{item.variant_count}</td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      item.is_active
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-gray-700 text-gray-500'
                    }`}
                  >
                    {item.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/sa-console-x7k2/items/${item.id}/edit`}
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      Edit
                    </Link>
                    <form action={toggleSAItemActiveAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        type="submit"
                        className={`text-xs ${
                          item.is_active
                            ? 'text-red-400 hover:text-red-300'
                            : 'text-green-400 hover:text-green-300'
                        }`}
                      >
                        {item.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-600">
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
