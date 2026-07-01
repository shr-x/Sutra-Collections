import { requireSA } from '@/lib/sa-auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import { deleteSATailoringAction } from './actions';

interface OrderRow {
  id: string;
  order_number: string;
  stage: string;
  price: string;
  due_date: string | null;
  created_at: string;
  customer_name: string;
  design_name: string | null;
  tailor_name: string | null;
}

// Stage values from DB: placed | production | ready | delivered
const STAGE_BADGE: Record<string, string> = {
  placed:     'bg-blue-900/40 text-blue-400',
  production: 'bg-yellow-900/40 text-yellow-400',
  ready:      'bg-purple-900/40 text-purple-400',
  delivered:  'bg-green-900/40 text-green-400',
};

export default async function TailoringPage() {
  await requireSA();

  const { rows } = await query<OrderRow>(`
    SELECT o.id, o.order_number, o.stage, o.price::text, o.due_date::text, o.created_at,
           COALESCE(c.name, 'Unknown') AS customer_name,
           d.name AS design_name,
           t.name AS tailor_name
    FROM tailoring_orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN designs d ON d.id = o.design_id
    LEFT JOIN tailors t ON t.id = o.tailor_id
    ORDER BY o.created_at DESC
    LIMIT 200
  `);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tailoring Orders</h1>
        <p className="text-sm text-gray-500">{rows.length} order{rows.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-700/50">
            <tr>
              {['Order #', 'Customer', 'Design', 'Tailor', 'Stage', 'Price', 'Due Date', 'Created', 'Actions'].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t border-gray-700 hover:bg-gray-700/30">
                <td className="px-4 py-3 font-mono text-sm text-gray-300">{o.order_number}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{o.customer_name}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{o.design_name ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{o.tailor_name ?? '—'}</td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                      STAGE_BADGE[o.stage] ?? 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {o.stage}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  ₹{Number(o.price).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  {o.due_date ? new Date(o.due_date).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  {new Date(o.created_at).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/sa-console-x7k2/tailoring/${o.id}/edit`}
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      Edit
                    </Link>
                    <form
                      action={deleteSATailoringAction}
                    >
                      <input type="hidden" name="id" value={o.id} />
                      <button
                        type="submit"
                        className="rounded bg-red-900 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-800"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-600">
                  No tailoring orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
