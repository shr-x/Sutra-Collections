import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';

export const metadata: Metadata = { title: 'Tailors' };

interface TailorRow {
  id: string;
  name: string;
  phone: string | null;
  specialty: string | null;
  is_active: boolean;
  active_orders: string;
  total_orders: string;
}

export default async function TailorsPage() {
  await requireRole('admin');

  const { rows } = await query<TailorRow>(
    `SELECT t.id, t.name, t.phone, t.specialty, t.is_active,
            COUNT(o.id) FILTER (WHERE o.stage NOT IN ('delivered'))::text AS active_orders,
            COUNT(o.id)::text AS total_orders
     FROM tailors t
     LEFT JOIN tailoring_orders o ON o.tailor_id = t.id
     GROUP BY t.id
     ORDER BY t.is_active DESC, t.name`
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tailors</h1>
          <p className="text-sm text-gray-500">{rows.length} tailor{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/tailoring/tailors/new" className="btn-primary">+ New Tailor</Link>
      </div>

      <div className="card p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            No tailors yet.{' '}
            <Link href="/tailoring/tailors/new" className="text-purple-600 underline">Add one →</Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left whitespace-nowrap">Name</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Phone</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Specialty</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Active Orders</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Total</th>
                <th className="px-4 py-3 whitespace-nowrap" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((t) => (
                <tr key={t.id} className={`hover:bg-gray-50 ${!t.is_active ? 'bg-gray-50/70' : ''}`}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/tailoring/tailors/${t.id}`} className="text-purple-700 hover:underline">
                      {t.name}
                    </Link>
                    {!t.is_active && (
                      <span className="ml-2 text-xs text-gray-400">(inactive)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{t.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{t.specialty && t.specialty !== 'null' ? t.specialty : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{t.active_orders}</td>
                  <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap">{t.total_orders}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/tailoring/tailors/${t.id}`} className="text-xs text-purple-600 hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
