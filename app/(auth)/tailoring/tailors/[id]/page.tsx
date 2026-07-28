import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatInr } from '@/lib/gst';
import { updateTailorAction, toggleTailorActiveAction } from '../actions';
import type { TailoringStatus } from '@/types';

export const metadata: Metadata = { title: 'Tailor Profile' };

const STATUS_BADGE: Record<TailoringStatus, string> = {
  in_progress:      'bg-amber-100 text-amber-700',
  ready_for_pickup: 'bg-green-100 text-green-700',
  picked_up:        'bg-blue-100 text-blue-700',
  delivered:        'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<TailoringStatus, string> = {
  in_progress: 'In Progress', ready_for_pickup: 'Ready for Pickup', picked_up: 'Picked Up', delivered: 'Delivered',
};

interface PageProps {
  params: { id: string };
}

export default async function TailorProfilePage({ params }: PageProps) {
  await requireRole('admin');

  const tailorRes = await query<{
    id: string; name: string; phone: string | null; specialty: string | null;
    notes: string | null; is_active: boolean; created_at: string;
  }>(`SELECT * FROM tailors WHERE id=$1`, [params.id]);

  if (!tailorRes.rows[0]) notFound();
  const tailor = tailorRes.rows[0];

  const [activeRes, completedRes, statsRes] = await Promise.all([
    query<{
      id: string; order_number: string; status: string; total_amount: string;
      due_date: string | null; design_name: string; customer_name: string;
    }>(
      `SELECT o.id, o.order_number, o.status, o.total_amount::text, o.due_date::text,
              d.name AS design_name, c.name AS customer_name
       FROM tailoring_orders o
       JOIN designs   d ON d.id = o.design_id
       JOIN customers c ON c.id = o.customer_id
       WHERE o.tailor_id=$1 AND o.status != 'delivered'
       ORDER BY o.due_date ASC NULLS LAST`,
      [params.id]
    ),
    query<{
      id: string; order_number: string; total_amount: string;
      design_name: string; customer_name: string; updated_at: string;
    }>(
      `SELECT o.id, o.order_number, o.total_amount::text, o.updated_at::text,
              d.name AS design_name, c.name AS customer_name
       FROM tailoring_orders o
       JOIN designs   d ON d.id = o.design_id
       JOIN customers c ON c.id = o.customer_id
       WHERE o.tailor_id=$1 AND o.status='delivered'
       ORDER BY o.updated_at DESC LIMIT 20`,
      [params.id]
    ),
    query<{ total: string; active: string; revenue: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status != 'delivered')::text AS active,
              COALESCE(SUM(total_amount), 0)::text AS revenue
       FROM tailoring_orders WHERE tailor_id=$1`,
      [params.id]
    ),
  ]);

  const stats = statsRes.rows[0];

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/tailoring/tailors" className="text-sm text-purple-600 hover:underline">
            ← Tailors
          </Link>
          <h1 className="page-title mt-1">{tailor.name}</h1>
          {!tailor.is_active && (
            <span className="mt-1 inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
              Inactive
            </span>
          )}
        </div>
        <form action={toggleTailorActiveAction}>
          <input type="hidden" name="id" value={tailor.id} />
          <input type="hidden" name="is_active" value={String(tailor.is_active)} />
          <button
            type="submit"
            className={
              tailor.is_active
                ? 'btn-secondary text-sm'
                : 'rounded-full border border-green-500 px-4 py-2 text-sm font-semibold text-green-600 hover:bg-green-50 transition-colors'
            }
          >
            {tailor.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column: details + stats + edit form */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Details</h2>
            <dl className="space-y-3 text-sm">
              {tailor.phone && (
                <div>
                  <dt className="text-xs text-gray-400">Phone</dt>
                  <dd className="font-medium">{tailor.phone}</dd>
                </div>
              )}
              {tailor.specialty && (
                <div>
                  <dt className="text-xs text-gray-400">Specialty</dt>
                  <dd className="font-medium">{tailor.specialty}</dd>
                </div>
              )}
              {tailor.notes && (
                <div>
                  <dt className="text-xs text-gray-400">Notes</dt>
                  <dd className="whitespace-pre-line text-gray-600">{tailor.notes}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-400">Joined</dt>
                <dd className="text-gray-500">
                  {new Date(tailor.created_at).toLocaleDateString('en-IN')}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Stats</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats?.total ?? '0'}</p>
                <p className="text-xs text-gray-400">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">{stats?.active ?? '0'}</p>
                <p className="text-xs text-gray-400">Active</p>
              </div>
              <div>
                <p className="text-base font-bold text-green-700">
                  {formatInr(Number(stats?.revenue ?? 0))}
                </p>
                <p className="text-xs text-gray-400">Revenue</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Edit Details</h2>
            <form action={updateTailorAction} className="space-y-3">
              <input type="hidden" name="id" value={tailor.id} />
              <div>
                <label className="label mb-1">Name *</label>
                <input name="name" required defaultValue={tailor.name} className="input w-full" />
              </div>
              <div>
                <label className="label mb-1">Phone</label>
                <input name="phone" type="tel" defaultValue={tailor.phone ?? ''} className="input w-full" />
              </div>
              <div>
                <label className="label mb-1">Specialty</label>
                <input name="specialty" defaultValue={tailor.specialty ?? ''} className="input w-full" />
              </div>
              <div>
                <label className="label mb-1">Notes</label>
                <textarea name="notes" rows={2} defaultValue={tailor.notes ?? ''} className="input w-full" />
              </div>
              <button type="submit" className="btn-primary w-full text-sm">Save Changes</button>
            </form>
          </div>
        </div>

        {/* Right column: active + completed orders */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-0 overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-sm font-semibold text-gray-700">
                Active Orders ({activeRes.rows.length})
              </h2>
            </div>
            {activeRes.rows.length === 0 ? (
              <p className="px-4 pb-6 text-sm text-gray-400">No active orders.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {activeRes.rows.map((o) => {
                    const isOverdue = o.due_date && new Date(o.due_date) < new Date();
                    return (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/tailoring/${o.id}`}
                            className="font-mono text-xs font-bold text-purple-700 hover:underline"
                          >
                            {o.order_number}
                          </Link>
                          <p className="text-xs text-gray-500">{o.design_name}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-700">{o.customer_name}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[o.status as TailoringStatus]}`}
                          >
                            {STATUS_LABEL[o.status as TailoringStatus]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {o.due_date && (
                            <span className={isOverdue ? 'font-semibold text-red-600' : 'text-gray-400'}>
                              {isOverdue ? '⚠ ' : ''}
                              {new Date(o.due_date).toLocaleDateString('en-IN', {
                                day: 'numeric', month: 'short',
                              })}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-medium">
                          {formatInr(Number(o.total_amount))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {completedRes.rows.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-sm font-semibold text-gray-700">Recent Completed Orders</h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {completedRes.rows.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/tailoring/${o.id}`}
                          className="font-mono text-xs font-bold text-purple-700 hover:underline"
                        >
                          {o.order_number}
                        </Link>
                        <p className="text-xs text-gray-500">{o.design_name}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-700">{o.customer_name}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">
                        {new Date(o.updated_at).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-medium">
                        {formatInr(Number(o.total_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
