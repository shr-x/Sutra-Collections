import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { toggleSchemeAction } from './actions';

export const metadata: Metadata = { title: 'Discount Schemes' };

function schemeStatus(s: { is_active: boolean; valid_from: string | null; valid_until: string | null }) {
  if (!s.is_active) return { label: 'Disabled', cls: 'bg-gray-100 text-gray-500' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (s.valid_from && new Date(s.valid_from) > today) return { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700' };
  if (s.valid_until && new Date(s.valid_until) < today) return { label: 'Expired', cls: 'bg-red-100 text-red-700' };
  return { label: 'Active', cls: 'bg-green-100 text-green-700' };
}

export default async function SchemesPage() {
  await requireRole('admin');
  const res = await query(`SELECT ds.*, bi.name AS buy_item_name, gi.name AS get_item_name FROM discount_schemes ds LEFT JOIN items bi ON bi.id=ds.buy_item_id LEFT JOIN items gi ON gi.id=ds.get_item_id ORDER BY ds.created_at DESC`);
  const schemes = res.rows;

  return (
    <div>
      <div className="mb-4">
        <Link href="/settings" className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1">
          ← Back to Settings
        </Link>
      </div>
      <div className="page-header">
        <h1 className="page-title">Discount Schemes</h1>
        <Link href="/settings/schemes/new" className="btn-primary">+ New Scheme</Link>
      </div>
      <div className="card p-0 overflow-hidden">
        {schemes.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">No schemes yet. <Link href="/settings/schemes/new" className="text-purple-600 underline">Create one →</Link></p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">Name</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Type</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Details</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Validity</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Status</th>
                <th className="px-4 py-3 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schemes.map((s) => {
                const toggleAction = toggleSchemeAction.bind(null, s.id);
                const status = schemeStatus(s as { is_active: boolean; valid_from: string | null; valid_until: string | null });
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 capitalize">{(s.scheme_type as string).replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {s.scheme_type === 'buy_x_get_y'
                        ? `Buy ${s.buy_quantity} ${s.buy_item_name ?? '?'} → Get ${s.get_quantity} ${s.get_item_name ?? '?'} free`
                        : s.discount_value
                        ? `${s.scheme_type === 'percent' ? `${s.discount_value}%` : `Rs.${s.discount_value}`} off`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {s.valid_from || s.valid_until
                        ? `${s.valid_from ? new Date(s.valid_from).toLocaleDateString('en-IN') : '—'} → ${s.valid_until ? new Date(s.valid_until).toLocaleDateString('en-IN') : '∞'}`
                        : 'Always'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>
                          {status.label}
                        </span>
                        <form action={toggleAction}>
                          <button
                            type="submit"
                            title={s.is_active ? 'Click to disable' : 'Click to enable'}
                            className="text-xs text-gray-400 hover:text-gray-600 underline"
                          >
                            {s.is_active ? 'Disable' : 'Enable'}
                          </button>
                        </form>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/settings/schemes/${s.id}/edit`} className="text-xs text-purple-600 hover:underline">Edit</Link>
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
  );
}
