import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import ConfirmForm from '@/components/confirm-form';
import { updateStageAction, deleteOrderAction } from '../actions';
import OrderDetailsPanel from './order-details-panel';
import AssignTailorSection from './assign-tailor-section';
import type { TailoringStage } from '@/types';

export const metadata: Metadata = { title: 'Tailoring Order' };

const STAGE_BADGE: Record<TailoringStage, string> = {
  placed:     'badge-blue',
  production: 'badge-amber',
  ready:      'badge-green',
  delivered:  'badge-gray',
};

const STAGE_LABEL: Record<TailoringStage, string> = {
  placed:     'Order Placed',
  production: 'In Production',
  ready:      'Ready for Pickup',
  delivered:  'Delivered',
};

const ALL_STAGES: TailoringStage[] = ['placed', 'production', 'ready', 'delivered'];

export default async function TailoringOrderDetailPage({ params }: { params: { id: string } }) {
  const session = await requireRole('admin', 'staff');

  const res = await query(
    `SELECT o.id, o.order_number, o.group_number, o.suffix, o.stage, o.price::numeric, o.due_date::text, o.notes,
            o.color_fabric, o.created_at, o.updated_at, o.tailor_id, o.batch_id,
            c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone,
            d.id AS design_id, d.name AS design_name, d.category AS design_category,
            d.photo_path AS design_photo,
            mv.id AS version_id, mv.version_number,
            t.name AS tailor_name,
            creator.name AS created_by_name
     FROM tailoring_orders o
     JOIN customers c    ON c.id = o.customer_id
     JOIN designs d      ON d.id = o.design_id
     LEFT JOIN measurement_versions mv ON mv.id = o.measurement_version_id
     LEFT JOIN tailors t ON t.id = o.tailor_id
     LEFT JOIN users creator ON creator.id = o.created_by
     WHERE o.id = $1`,
    [params.id]
  );
  if (!res.rows[0]) notFound();
  const order = res.rows[0];

  const fieldsRes = await query<{
    id: string; field_name: string; field_type: 'number' | 'text'; unit: string | null;
  }>(
    `SELECT id, field_name, field_type, unit
     FROM design_measurement_fields WHERE design_id=$1
     ORDER BY sort_order, field_name`,
    [order.design_id]
  );

  const valRes = order.version_id
    ? await query<{ field_id: string; value: string }>(
        `SELECT f.id AS field_id, mv.value
         FROM measurement_values mv
         JOIN design_measurement_fields f ON f.id = mv.field_id
         WHERE mv.version_id = $1`,
        [order.version_id]
      )
    : { rows: [] };

  const currentMeasurements: Record<string, string> = {};
  for (const row of valRes.rows) {
    currentMeasurements[row.field_id] = row.value;
  }

  interface SiblingRow {
    id: string;
    order_number: string;
    group_number: string | null;
    suffix: string | null;
    stage: TailoringStage;
    design_name: string;
    color_fabric: string | null;
  }
  const siblings: SiblingRow[] = [];
  if (order.batch_id) {
    const sibRes = await query<SiblingRow>(
      `SELECT o.id, o.order_number, o.group_number, o.suffix, o.stage, d.name AS design_name, o.color_fabric
       FROM tailoring_orders o
       JOIN designs d ON d.id = o.design_id
       WHERE o.batch_id = $1 AND o.id != $2
       ORDER BY o.suffix ASC, o.created_at ASC`,
      [order.batch_id, order.id]
    );
    siblings.push(...sibRes.rows);
  }

  const stage   = order.stage as TailoringStage;
  const currIdx = ALL_STAGES.indexOf(stage);
  const isAdmin = session.role === 'admin';

  return (
    <div>
      {/* ── Page header ── */}
      <div className="mb-4 sm:mb-6">
        <Link href="/tailoring" className="text-sm text-purple-600 hover:underline">
          ← Tailoring Orders
        </Link>

        {/* Title row: order number + status badge */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="page-title">{order.order_number}</h1>
          <span className={STAGE_BADGE[stage]}>
            {STAGE_LABEL[stage]}
          </span>
          {order.batch_id && (
            <span className="badge-amber">
              🔗 {siblings.length + 1} items
            </span>
          )}
        </div>

        {order.batch_id && order.group_number && (
          <p className="mt-0.5 text-xs text-gray-500">
            Part of group {order.group_number}, item {order.suffix} of {siblings.length + 1}
          </p>
        )}

        {/* Action buttons row — clearly rectangular, distinct from status badges */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={`/api/tailoring/${order.id}/customer-pdf`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary btn-sm"
          >
            📄 Customer PDF
          </a>
          <a
            href={`/api/tailoring/${order.id}/tailor-pdf`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary btn-sm"
          >
            🔧 Tailor PDF
          </a>
          {isAdmin && (
            <ConfirmForm
              action={deleteOrderAction}
              message={`Delete order ${order.order_number}? This cannot be undone.`}
            >
              <input type="hidden" name="id" value={order.id} />
              <button type="submit" className="btn-destructive btn-sm">
                🗑 Delete
              </button>
            </ConfirmForm>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: editable details + measurements */}
        <div className="lg:col-span-2">
          <OrderDetailsPanel
            orderId={order.id}
            stage={stage}
            currentColorFabric={order.color_fabric}
            currentNotes={order.notes}
            currentDueDate={order.due_date}
            fields={fieldsRes.rows}
            currentMeasurements={currentMeasurements}
            currentVersionNumber={order.version_number ? Number(order.version_number) : null}
            customerId={order.customer_id}
            customerName={order.customer_name}
            customerPhone={order.customer_phone}
            designId={order.design_id}
            designName={order.design_name}
            designCategory={order.design_category}
            price={Number(order.price)}
          />
        </div>

        {/* Right: stage + tailor + photo + meta + batch siblings */}
        <div className="space-y-4">
          {/* Stage card */}
          <div className="card">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Status</h2>

            {/* Vertical timeline */}
            <ol className="mb-4 space-y-0">
              {ALL_STAGES.map((s, i) => {
                const sIdx    = ALL_STAGES.indexOf(s);
                const done    = sIdx < currIdx;
                const current = s === stage;
                return (
                  <li key={s} className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                          current ? 'border-purple-600 bg-purple-600' :
                          done    ? 'border-purple-300 bg-purple-200' :
                                    'border-gray-200 bg-white'
                        }`}
                      />
                      {i < ALL_STAGES.length - 1 && (
                        <div
                          className={`w-0.5 flex-1 ${done ? 'bg-purple-200' : 'bg-gray-100'}`}
                          style={{ minHeight: 18 }}
                        />
                      )}
                    </div>
                    <div className="pb-3">
                      <p className={`text-sm leading-5 ${
                        current ? 'font-bold text-purple-700' :
                        done    ? 'text-gray-400' :
                                  'text-gray-300'
                      }`}>
                        {STAGE_LABEL[s]}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Tailor assignment */}
            {(stage === 'placed' || stage === 'production') && (
              <AssignTailorSection
                orderId={order.id}
                stage={stage}
                currentTailorId={order.tailor_id ?? null}
                currentTailorName={order.tailor_name ?? null}
              />
            )}

            {stage === 'production' && (
              <form action={updateStageAction} className="mt-3">
                <input type="hidden" name="order_id" value={order.id} />
                <input type="hidden" name="stage" value="ready" />
                <button type="submit" className="btn-primary w-full">
                  Mark Ready for Pickup
                </button>
              </form>
            )}

            {stage === 'ready' && (
              <form action={updateStageAction} className="mt-3">
                <input type="hidden" name="order_id" value={order.id} />
                <input type="hidden" name="stage" value="delivered" />
                <button type="submit" className="btn-primary w-full">
                  Mark Delivered
                </button>
              </form>
            )}
          </div>

          {/* Batch siblings */}
          {order.batch_id && (
            <div className="card">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <span>🔗</span>
                <span>
                  {order.group_number
                    ? `Group ${order.group_number} — ${siblings.length + 1} items`
                    : `Batch (${siblings.length + 1} items)`}
                </span>
              </h2>
              <ul className="space-y-2">
                <li className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-purple-700">
                      {order.order_number}
                    </span>
                    <span className="ml-1.5 text-xs text-gray-500">{order.design_name}</span>
                    {order.color_fabric && <span className="ml-1 text-xs italic text-gray-400">{order.color_fabric}</span>}
                  </div>
                  <span className={STAGE_BADGE[stage]}>
                    {STAGE_LABEL[stage]}
                  </span>
                </li>
                {siblings.map((sib) => (
                  <li key={sib.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div>
                      <Link
                        href={`/tailoring/${sib.id}`}
                        className="font-mono text-xs font-bold text-purple-700 hover:underline"
                      >
                        {sib.order_number}
                      </Link>
                      <span className="ml-1.5 text-xs text-gray-500">{sib.design_name}</span>
                      {sib.color_fabric && <span className="ml-1 text-xs italic text-gray-400">{sib.color_fabric}</span>}
                    </div>
                    <span className={STAGE_BADGE[sib.stage]}>
                      {STAGE_LABEL[sib.stage]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Design photo */}
          {order.design_photo && (
            <div className="card overflow-hidden p-0">
              <img
                src={`/${order.design_photo}`}
                alt={order.design_name}
                className="max-h-64 w-full object-cover"
              />
              <div className="px-4 py-2 text-xs text-gray-500">Design: {order.design_name}</div>
            </div>
          )}

          {/* Meta */}
          <div className="card space-y-1 text-xs text-gray-400">
            <div>Created: {new Date(order.created_at).toLocaleString('en-IN')}</div>
            {order.created_by_name && <div>By: {order.created_by_name}</div>}
            <div>Updated: {new Date(order.updated_at).toLocaleString('en-IN')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
