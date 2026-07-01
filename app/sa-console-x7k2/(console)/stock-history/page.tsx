import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';

interface AdjRow {
  id: string;
  quantity: number;
  reason: string | null;
  adjusted_by: string;
  adjusted_at: string;
  item_name: string;
  warehouse_name: string;
}

export default async function StockHistoryPage() {
  await requireSA();

  const { rows } = await query<AdjRow>(`
    SELECT sa.id, sa.quantity, sa.reason, sa.adjusted_by, sa.adjusted_at,
           i.name AS item_name,
           w.name AS warehouse_name
    FROM sa_stock_adjustments sa
    JOIN items i ON i.id = sa.item_id
    JOIN warehouses w ON w.id = sa.warehouse_id
    ORDER BY sa.adjusted_at DESC
    LIMIT 500
  `);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Stock History</h1>
        <p className="text-sm text-gray-500">Last 500 SA stock adjustments</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-700/50">
            <tr>
              {['Date', 'Item', 'Warehouse', 'Qty Change', 'Reason', 'Adjusted By'].map((h) => (
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
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                <td className="px-4 py-3 text-sm text-gray-300">
                  {new Date(row.adjusted_at).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">{row.item_name}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{row.warehouse_name}</td>
                <td
                  className={`px-4 py-3 text-sm font-semibold ${
                    Number(row.quantity) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {Number(row.quantity) > 0 ? '+' : ''}
                  {row.quantity}
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">{row.reason ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{row.adjusted_by}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
                  No stock adjustments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
