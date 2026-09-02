import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import ConfirmForm from '@/components/confirm-form';
import { deleteDesignAction } from '../actions';
import AddFieldForm from './add-field-form';
import FieldsList from './fields-list';

export const metadata: Metadata = { title: 'Design' };

export default async function DesignDetailPage({ params }: { params: { id: string } }) {
  const session = await requireRole('admin');

  const [designRes, fieldsRes] = await Promise.all([
    query(
      `SELECT d.*, u.name AS created_by_name
       FROM designs d LEFT JOIN users u ON u.id=d.created_by
       WHERE d.id=$1`,
      [params.id]
    ),
    query<{ id: string; field_name: string; field_type: 'number' | 'text'; unit: string | null }>(
      `SELECT id, field_name, field_type, unit FROM design_measurement_fields
       WHERE design_id=$1 ORDER BY sort_order, field_name`,
      [params.id]
    ),
  ]);

  if (!designRes.rows[0]) notFound();
  const d      = designRes.rows[0];
  const fields = fieldsRes.rows;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/designs" className="text-sm text-purple-600 hover:underline">← Design Catalog</Link>
          <h1 className="page-title mt-1">{d.name}</h1>
          {d.category && <p className="text-sm text-gray-500 mt-0.5">{d.category}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/tailoring/new?design=${d.id}`} className="btn-primary">+ New Order</Link>
          <Link href={`/designs/${d.id}/edit`} className="btn-secondary">Edit</Link>
          {session.role === 'admin' && (
            <ConfirmForm
              action={deleteDesignAction}
              message="Delete this design? All associated measurement fields will also be deleted. Existing orders are not affected."
            >
              <input type="hidden" name="id" value={d.id} />
              <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
                Delete
              </button>
            </ConfirmForm>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: photo + description */}
        <div className="space-y-4">
          <div className="card p-0 overflow-hidden">
            {d.photo_path ? (
              <img
                src={`/${d.photo_path}`}
                alt={d.name}
                className="w-full aspect-square object-cover"
              />
            ) : (
              <div className="flex w-full aspect-square items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50 p-6 text-center">
                <span className="line-clamp-4 text-2xl font-semibold leading-tight text-gray-400">{d.name}</span>
              </div>
            )}
          </div>
          {d.description && (
            <div className="card text-sm text-gray-700 whitespace-pre-wrap">{d.description}</div>
          )}
          <div className="card text-xs text-gray-400">
            Created by {d.created_by_name ?? 'unknown'} on{' '}
            {new Date(d.created_at).toLocaleDateString('en-IN')}
          </div>
        </div>

        {/* Right: measurement fields */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Measurement Fields</h2>
              <span className="text-xs text-gray-400">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
            </div>

            <FieldsList designId={d.id} fields={fields} />
          </div>

          {/* Add field form */}
          <AddFieldForm designId={d.id} />
        </div>
      </div>
    </div>
  );
}
